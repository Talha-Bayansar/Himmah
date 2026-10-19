import {
  CommunityError,
  uuid,
  versionInput,
  pageInput,
  pageResult,
} from "../community/contracts.ts";
import { periodInput } from "../periods/contracts.ts";
import type { OrganizationStore } from "./store.ts";
import type { PeriodStore } from "./period-store.ts";
export async function periodApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  periods: PeriodStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/periods(?:\/([0-9a-f-]{36})(?:\/(members|groups|summary|close))?)?$/i,
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
      id = match[2] ? uuid(match[2]) : null,
      part = match[3];
    const membership = await organizations.get(user.id, org);
    if (!membership) throw new CommunityError("not_found", 404);
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (!["owner", "admin"].includes(membership.role))
      throw new CommunityError("forbidden", 403);
    const period = id ? (await periods.get(user.id, org, id))[0] : null;
    if (id && !period) throw new CommunityError("not_found", 404);
    if (request.method === "GET") {
      if (id && !part) return respond({ item: period });
      if (part === "close") return respond({ code: "not_found" }, 404);
      const input = pageInput(
        url,
        `${user.id}:${org}/periods/${id ?? "list"}/${part ?? "list"}/${period?.version ?? 0}`,
      );
      if (
        (!id && input.groupId) ||
        (id && input.archived) ||
        (part === "groups" && input.groupId)
      )
        throw new CommunityError("invalid_input");
      let group = null;
      if (id && input.groupId) {
        group = (await periods.group(user.id, org, id, input.groupId))[0];
        if (!group) throw new CommunityError("not_found", 404);
      }
      if (id && part === "summary")
        return respond({
          item: (await periods.summary(user.id, org, id, input.groupId))[0],
          group,
        });
      const rows = !id
        ? await periods.list(user.id, org, input)
        : part === "groups"
          ? await periods.groups(user.id, org, id, input)
          : await periods.members(user.id, org, id, input);
      return respond(
        pageResult(rows as { id: string; createdAt: string }[], input),
      );
    }
    if (!(
      (!id && request.method === "POST") ||
      (id && !part && request.method === "PATCH") ||
      (id && part === "close" && request.method === "POST")
    ))
      return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 4000) throw new CommunityError("invalid_input");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    const payload =
      part === "close"
        ? { action: "close", version: versionInput(body) }
        : id
          ? {
              ...periodInput(body),
              action: "edit",
              version: versionInput(body),
            }
          : periodInput(body);
    const result = (
      await periods.save(user.id, org, id, id ? null : uuid(body.key), payload)
    )[0]?.result as { id?: string; code?: string } | undefined;
    if (!result) throw new CommunityError("service", 503);
    if (result.code)
      throw new CommunityError(
        result.code,
        result.code === "forbidden"
          ? 403
          : result.code === "not_found"
            ? 404
            : result.code === "invalid_input"
              ? 400
              : 409,
      );
    return respond(
      { item: (await periods.get(user.id, org, result.id!))[0] },
      id ? 200 : 201,
    );
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    throw error;
  }
}
