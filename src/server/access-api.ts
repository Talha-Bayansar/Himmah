import { accessInput } from "../access/contracts.ts";
import {
  CommunityError,
  pageInput,
  pageResult,
  uuid,
  versionInput,
} from "../community/contracts.ts";
import type { AccessStore } from "./access-store.ts";
import type { OrganizationStore } from "./store.ts";
export async function accessApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  access: AccessStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/(access(?:\/(me|staff|[0-9a-f-]{36})(?:\/(history))?)?)$/i,
    );
  if (!match) return null;
  const respond = (value: unknown, status = 200) =>
    Response.json(value, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  try {
    const org = uuid(match[1]),
      part = match[3],
      history = !!match[4],
      id = part && !["me", "staff"].includes(part) ? uuid(part) : null;
    const membership = await organizations.get(user.id, org);
    if (!membership) throw new CommunityError("not_found", 404);
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (request.method === "GET" && part === "me")
      return respond({ item: (await access.me(user.id, org))[0] });
    if (!["owner", "admin"].includes(membership.role))
      throw new CommunityError("forbidden", 403);
    if (id && !(await access.get(user.id, org, id))[0])
      throw new CommunityError("not_found", 404);
    if (request.method === "GET") {
      if (id && !history)
        return respond({ item: (await access.get(user.id, org, id))[0] });
      const input = pageInput(
        url,
        `${user.id}:${org}/access/${id ?? part ?? "list"}`,
      );
      if (
        input.groupId ||
        (part === "staff" && input.archived) ||
        (history && input.archived)
      )
        throw new CommunityError("invalid_input");
      const rows =
        part === "staff"
          ? await access.staff(user.id, org, input)
          : history
            ? await access.history(user.id, org, id!, input)
            : await access.list(user.id, org, input);
      return respond(
        pageResult(rows as { id: string; createdAt: string }[], input),
      );
    }
    if (
      history ||
      part === "me" ||
      part === "staff" ||
      !(
        (!id && request.method === "POST") ||
        (id && ["PATCH", "DELETE"].includes(request.method))
      )
    )
      return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 5000) throw new CommunityError("invalid_input");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    const payload =
      request.method === "DELETE"
        ? { action: "revoke", version: versionInput(body) }
        : id
          ? {
              ...accessInput(body, false),
              action: "edit",
              version: versionInput(body),
            }
          : accessInput(body, true);
    const result = (
      await access.save(user.id, org, id, id ? null : uuid(body.key), payload)
    )[0]?.result as { id?: string; code?: string } | undefined;
    if (!result) throw new CommunityError("service", 503);
    if (result.code)
      throw new CommunityError(
        result.code,
        result.code === "forbidden"
          ? 403
          : result.code === "not_found"
            ? 404
            : result.code === "invalid_input" ||
                result.code === "access_capabilities"
              ? 400
              : 409,
      );
    return respond(
      { item: (await access.get(user.id, org, result.id!))[0] },
      id ? 200 : 201,
    );
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    throw error;
  }
}
