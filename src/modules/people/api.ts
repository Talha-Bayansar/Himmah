import { communicationApi } from "./communication-api.ts";
import { directoryApi } from "./directory-api.ts";
import {
  pageInput,
  pageResult,
  CommunityError,
} from "../../community/contracts.ts";
import {
  contactInput,
  methodInput,
  expectedVersion,
  uuid,
  PeopleError,
} from "./contracts.ts";
import type { PeopleStore } from "./store.ts";
export async function peopleApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  store: PeopleStore,
): Promise<Response> {
  const respond = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  try {
    const url = new URL(request.url);
    const prefix = url.pathname.match(
      /^\/api\/organizations\/([^/]+)\/people\/(.+)$/,
    );
    if (!prefix) return respond({ code: "not_found_or_forbidden" }, 404);
    const org = uuid(prefix[1]);
    if (!user.emailVerified) return respond({ code: "verify_required" }, 403);
    if (!(await store.context(user.id, org)))
      return respond({ code: "not_found_or_forbidden" }, 404);
    const readBody = async () => {
      const text = await request.text();
      if (text.length > 16000) throw new PeopleError("invalid_input");
      try {
        const value: unknown = JSON.parse(text);
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw Error();
        return value as Record<string, unknown>;
      } catch {
        throw new PeopleError("invalid_input");
      }
    };
    const parts = prefix[2]!.split("/");
    if (parts.length > 4 || parts.some((p) => !p))
      return respond({ code: "not_found_or_forbidden" }, 404);
    const communication = await communicationApi(
      request,
      user,
      store,
      org,
      parts,
      readBody,
    );
    if (communication)
      return respond(communication.value, communication.status ?? 200);
    if (
      parts[0] === "groups" ||
      parts[0] === "relationship-types" ||
      ["memberships", "relationships", "group-options"].includes(parts[2] ?? "")
    ) {
      const directory = await directoryApi(
        request,
        user,
        store,
        org,
        parts,
        readBody,
      );
      if (directory) return respond(directory.value, directory.status ?? 200);
    }
    const match = url.pathname.match(
      /^\/api\/organizations\/([^/]+)\/people\/(context|contacts)(?:\/([^/]+))?(?:\/(methods|history|archive|restore)(?:\/([^/]+))?)?$/,
    );
    if (!match) return respond({ code: "not_found_or_forbidden" }, 404);
    const kind = match[2],
      id = match[3] ? uuid(match[3]) : null,
      child = match[4];
    if (
      (kind === "context" && (id || child)) ||
      (match[5] && (child !== "methods" || request.method === "GET"))
    )
      return respond({ code: "not_found_or_forbidden" }, 404);
    if (request.method === "GET") {
      if (kind === "context" && !id)
        return respond(await store.context(user.id, org));
      const p = pageInput(
        url,
        JSON.stringify(["people-v1", user.id, org, id, child]),
      );
      if (!id) return respond(pageResult(await store.list(user.id, org, p), p));
      const contact = await store.get(user.id, org, id);
      if (!contact) return respond({ code: "not_found_or_forbidden" }, 404);
      if (child === "methods")
        return respond({
          ...pageResult(await store.methods(user.id, org, id, p), p),
          total: await store.collectionCount(user.id, org, id, "methods", p),
        });
      if (child === "history")
        return respond({
          total: await store.collectionCount(user.id, org, id, "history", p),
          ...pageResult(
            (await store.history(user.id, org, id, p)) as {
              id: string;
              createdAt: string;
            }[],
            p,
          ),
        });
      if (!child) return respond(contact);
      return respond({ code: "not_found_or_forbidden" }, 404);
    }
    if (kind !== "contacts") return respond({ code: "invalid_input" }, 405);
    const text = await request.text();
    if (text.length > 8000) throw new PeopleError("invalid_input");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      throw new PeopleError("invalid_input");
    }
    let operation: string, payload: Record<string, unknown>;
    if (!id && request.method === "POST") {
      operation = "create";
      payload = { ...contactInput(body) };
    } else if (id && !child && request.method === "PATCH") {
      operation = "update";
      payload = {
        contactId: id,
        version: expectedVersion(body.version),
        ...contactInput(body),
      };
    } else if (
      id &&
      (child === "archive" || child === "restore") &&
      request.method === "POST"
    ) {
      operation = child;
      payload = { contactId: id, version: expectedVersion(body.version) };
    } else if (
      id &&
      child === "methods" &&
      request.method === "POST" &&
      !match[5]
    ) {
      operation = "add_method";
      payload = {
        contactId: id,
        version: expectedVersion(body.version),
        ...methodInput(body),
      };
    } else if (
      id &&
      child === "methods" &&
      request.method === "PATCH" &&
      match[5]
    ) {
      operation = "replace_method";
      payload = {
        contactId: id,
        version: expectedVersion(body.version),
        methodId: uuid(match[5]),
        ...methodInput(body),
      };
    } else if (
      id &&
      child === "methods" &&
      request.method === "DELETE" &&
      match[5]
    ) {
      operation = "end_method";
      payload = {
        contactId: id,
        version: expectedVersion(body.version),
        methodId: uuid(match[5]),
      };
    } else return respond({ code: "invalid_input" }, 405);
    const result = await store.command(
      user.id,
      org,
      operation,
      uuid(body.requestKey),
      payload,
    );
    if (result.code)
      return respond(
        { code: result.code },
        result.code === "not_found_or_forbidden"
          ? 404
          : result.code === "invalid_input"
            ? 400
            : 409,
      );
    return respond({ id: result.id, replayed: result.replayed });
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    // Never expose SQL, submitted contact details or credentials.
    return respond({ code: "service" }, 503);
  }
}
