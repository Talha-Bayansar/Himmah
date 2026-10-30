import { weeklyOccurrences } from "../activities/recurrence.ts";
import {
  activityInput,
  cancellationReason,
  sessionInput,
} from "../activities/contracts.ts";
import {
  CommunityError,
  pageInput,
  pageResult,
  uuid,
  versionInput,
} from "../community/contracts.ts";
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
    const sessions = !!match[3],
      sessionId = match[4] ? uuid(match[4]) : null;
    if (sessions) {
      if (!id) throw new CommunityError("not_found", 404);
      const parent = (await activities.get(user.id, orgId, id))[0];
      if (!parent) throw new CommunityError("not_found", 404);
      if (url.searchParams.has("schedule") || url.searchParams.has("plan")) {
        if (!["owner", "admin"].includes(org.role))
          throw new CommunityError("forbidden", 403);
        if (
          request.method === "GET" &&
          !sessionId &&
          url.searchParams.has("schedule")
        )
          return respond({
            items: await activities.schedule(
              user.id,
              orgId,
              id,
              uuid(url.searchParams.get("schedule")),
            ),
          });
        if (request.method !== "POST" || sessionId)
          throw new CommunityError("not_found", 404);
        const body = await readBody(request);
        const key = uuid(body.key);
        let input = body.occurrences;
        let rule: Record<string, unknown> | undefined;
        if (body.mode === "create") {
          if (
            !body.rule ||
            typeof body.rule !== "object" ||
            Array.isArray(body.rule)
          )
            throw new CommunityError("invalid_input");
          rule = body.rule as Record<string, unknown>;
          if (
            typeof rule.startLocal !== "string" ||
            typeof rule.endLocal !== "string" ||
            !Array.isArray(rule.weekdays) ||
            !rule.stop ||
            typeof rule.stop !== "object"
          )
            throw new CommunityError("invalid_input");
          const stop = rule.stop as { count?: number; until?: string };
          input = weeklyOccurrences(
            rule.startLocal,
            rule.endLocal,
            rule.weekdays,
            stop,
          );
          rule = {
            startLocal: rule.startLocal,
            endLocal: rule.endLocal,
            weekdays: [...rule.weekdays].sort(),
            stop,
          };
        }
        if (!Array.isArray(input) || input.length < 1 || input.length > 52)
          throw new CommunityError("series_limit");
        const occurrences = input.map((v) => {
          if (!v || typeof v !== "object" || Array.isArray(v))
            throw new CommunityError("invalid_input");
          const row = v as Record<string, unknown>;
          const times = sessionInput(
            { ...row, location: "" },
            String(parent.timezone),
            true,
          );
          return {
            startsAt: times.startsAt,
            endsAt: times.endsAt,
            ...(body.mode === "edit"
              ? { id: uuid(row.id), version: versionInput(row) }
              : {}),
          };
        });
        let payload: Record<string, unknown>;
        if (body.mode === "create") {
          if (body.priceMinor === undefined)
            throw new CommunityError("invalid_input");
          const fields = sessionInput(
            { ...body, ...(input[0] as object) },
            String(parent.timezone),
            true,
          );
          payload = {
            mode: "create",
            version: versionInput(body),
            timezone: String(parent.timezone),
            location: fields.location,
            priceMinor: fields.priceMinor ?? Number(parent.priceMinor ?? 0),
            rule,
            occurrences,
          };
        } else if (
          body.mode === "edit" &&
          ["one", "future"].includes(String(body.scope))
        )
          payload = {
            mode: "edit",
            anchor: uuid(body.anchor),
            scope: body.scope,
            occurrences,
          };
        else throw new CommunityError("invalid_input");
        const result = (
          await activities.planSessions(user.id, orgId, id, key, payload)
        )[0]?.result as { code?: string } | undefined;
        if (!result) throw new CommunityError("conflict", 409);
        if (result.code)
          throw new CommunityError(
            result.code,
            result.code === "forbidden"
              ? 403
              : result.code === "not_found"
                ? 404
                : 409,
          );
        return respond(result);
      }
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
    if (
      id &&
      !sessions &&
      (request.method === "DELETE" ||
        (request.method === "GET" &&
          url.searchParams.get("deletionPreview") === "true"))
    ) {
      if (!["owner", "admin"].includes(org.role))
        throw new CommunityError("forbidden", 403);
      let row;
      if (request.method === "GET")
        row = (await activities.deletionPreview(user.id, orgId, id))[0];
      else {
        const body = await readBody(request);
        if (
          typeof body.snapshot !== "string" ||
          !/^[a-f0-9]{32}$/.test(body.snapshot)
        )
          throw new CommunityError("invalid_input");
        row = (
          await activities.deleteActivity(
            user.id,
            orgId,
            id,
            uuid(body.key),
            body.snapshot,
          )
        )[0];
      }
      const result = row?.result as { code?: string } | undefined;
      if (!result) throw new CommunityError("conflict", 409);
      if (result.code)
        throw new CommunityError(
          result.code,
          result.code === "forbidden"
            ? 403
            : result.code === "not_found"
              ? 404
              : 409,
        );
      return respond(result);
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

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 24000) throw new CommunityError("invalid_input");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw new CommunityError("invalid_input");
  }
}
