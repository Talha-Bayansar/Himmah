import {
  CommunityError,
  uuid,
  versionInput,
  pageInput,
  pageResult,
} from "../community/contracts.ts";
import {
  activityInput,
  sessionInput,
  cancellationReason,
} from "../activities/contracts.ts";
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
    /^\/api\/organizations\/([0-9a-f-]{36})\/activities(?:\/([0-9a-f-]{36}))?(?:\/(sessions)(?:\/([0-9a-f-]{36}))?)?$/i,
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
    if (org.role === "participant") throw new CommunityError("forbidden", 403);
    const sessions = !!match[3],
      sessionId = match[4] ? uuid(match[4]) : null;
    if (sessions) {
      if (!id) throw new CommunityError("not_found", 404);
      const parent = (await activities.get(user.id, orgId, id))[0];
      if (!parent) throw new CommunityError("not_found", 404);
      if (request.method === "GET") {
        if (sessionId) {
          const item = (
            await activities.session(user.id, orgId, id, sessionId)
          )[0];
          if (!item) throw new CommunityError("not_found", 404);
          return respond({ item });
        }
        const view = url.searchParams.get("view") ?? "upcoming";
        if (!["upcoming", "past"].includes(view))
          throw new CommunityError("invalid_input");
        const input = pageInput(
          url,
          user.id + ":" + orgId + "/activities/" + id + "/sessions/" + view,
        );
        if (input.query || input.groupId || input.archived)
          throw new CommunityError("invalid_input");
        return respond(
          pageResult(
            (await activities.sessions(
              user.id,
              orgId,
              id,
              input,
              view as "upcoming" | "past",
            )) as { id: string; createdAt: string; startsAt: string }[],
            input,
            (row) => row.startsAt,
          ),
        );
      }
      if (!["owner", "admin"].includes(org.role))
        throw new CommunityError("forbidden", 403);
      if (!(
        (!sessionId && request.method === "POST") ||
        (sessionId && request.method === "PATCH")
      ))
        return respond({ code: "not_found" }, 404);
      const value = await readBody(request);
      let result;
      if (!sessionId)
        result = await activities.createSession(
          user.id,
          orgId,
          id,
          uuid(value.key),
          versionInput(value),
          sessionInput(value, String(parent.timezone)),
        );
      else if (value.cancelled === true)
        result = await activities.cancelSession(
          user.id,
          orgId,
          id,
          sessionId,
          versionInput(value),
          cancellationReason(value),
        );
      else if (value.cancelled !== undefined)
        throw new CommunityError("invalid_input");
      else {
        const current = (
          await activities.session(user.id, orgId, id, sessionId)
        )[0];
        if (!current) throw new CommunityError("not_found", 404);
        result = await activities.updateSession(
          user.id,
          orgId,
          id,
          sessionId,
          versionInput(value),
          sessionInput(value, String(current.timezone)),
        );
      }
      if (!result[0]) throw new CommunityError("conflict", 409);
      return respond({ item: result[0] }, sessionId ? 200 : 201);
    }
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
    const value = await readBody(request);
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
          activityInput(
            {
              ...value,
              attendancePoints:
                value.attendancePoints ?? current.attendancePoints ?? 0,
            },
            String(current.timezone),
          ),
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

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 16000) throw new CommunityError("invalid_input");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw new CommunityError("invalid_input");
  }
}
