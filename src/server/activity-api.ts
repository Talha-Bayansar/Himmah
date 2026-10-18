import {
  CommunityError,
  uuid,
  versionInput,
  pageInput,
  pageResult,
} from "../community/contracts.ts";
import { activityInput } from "../activities/contracts.ts";
import type { ActivityStore } from "./activity-store.ts";
import type { OrganizationStore } from "./store.ts";
export async function activityApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  activities: ActivityStore,
) {
  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/api\/organizations\/([0-9a-f-]{36})\/activities(?:\/([0-9a-f-]{36}))?$/i,
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
    const orgId = uuid(match[1]),
      id = match[2] ? uuid(match[2]) : null;
    const org = await organizations.get(user.id, orgId);
    if (!org) throw new CommunityError("not_found", 404);
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (request.method === "GET") {
      if (id) {
        const item = (await activities.get(user.id, orgId, id))[0];
        if (!item) throw new CommunityError("not_found", 404);
        return respond({ item });
      }
      const input = pageInput(url, user.id + ":" + orgId + "/activities");
      if (input.groupId) throw new CommunityError("invalid_input");
      return respond(
        pageResult(
          (await activities.list(user.id, orgId, input)) as {
            id: string;
            createdAt: string;
          }[],
          input,
        ),
      );
    }
    if (!["owner", "admin"].includes(org.role))
      throw new CommunityError("forbidden", 403);
    if (!(
      (!id && request.method === "POST") ||
      (id && request.method === "PATCH")
    ))
      return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 16000) throw new CommunityError("invalid_input");
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    let rows;
    if (!id)
      rows = await activities.create(
        user.id,
        orgId,
        uuid(value.key),
        activityInput(value, org.timezone),
      );
    else {
      const current = (await activities.get(user.id, orgId, id))[0];
      if (!current) throw new CommunityError("not_found", 404);
      if (value.cancelled === true)
        rows = await activities.cancel(user.id, orgId, id, versionInput(value));
      else if (value.cancelled !== undefined)
        throw new CommunityError("invalid_input");
      else
        rows = await activities.update(
          user.id,
          orgId,
          id,
          versionInput(value),
          activityInput(value, String(current.timezone)),
        );
    }
    if (!rows[0]) throw new CommunityError("conflict", 409);
    return respond({ item: rows[0] }, id ? 200 : 201);
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    throw error;
  }
}
