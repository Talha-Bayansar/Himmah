import {
  attendanceInput,
  attendanceStatuses,
  type AttendanceStatus,
} from "../attendance/contracts.ts";
import {
  CommunityError,
  pageInput,
  pageResult,
  uuid,
} from "../community/contracts.ts";
import type { ActivityStore } from "./activity-store.ts";
import type { AttendanceStore } from "./attendance-store.ts";
import type { OrganizationStore } from "./store.ts";
export async function attendanceApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  activities: ActivityStore,
  attendance: AttendanceStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/activities\/([0-9a-f-]{36})\/sessions\/([0-9a-f-]{36})\/attendance(?:\/([0-9a-f-]{36})\/history)?$/i,
    );
  if (!match) return null;
  const respond = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  try {
    const org = uuid(match[1]),
      activity = uuid(match[2]),
      session = uuid(match[3]),
      person = match[4] ? uuid(match[4]) : null;
    const membership = await organizations.get(user.id, org);
    if (!membership) throw new CommunityError("not_found", 404);
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (!["owner", "admin", "volunteer"].includes(membership.role))
      throw new CommunityError("forbidden", 403);
    if (!(await attendance.canSession(user.id, org, activity, session))[0])
      throw new CommunityError("forbidden", 403);
    if (!(await activities.session(user.id, org, activity, session))[0])
      throw new CommunityError("not_found", 404);
    if (request.method === "GET") {
      const status = url.searchParams.get("status") ?? "all",
        roster = url.searchParams.get("roster") ?? "all";
      if (!["all", "registered", "expected"].includes(roster))
        throw new CommunityError("invalid_input");
      if (!["all", ...attendanceStatuses].includes(status))
        throw new CommunityError("invalid_input");
      const input = pageInput(
        url,
        `${user.id}:${org}/attendance/${activity}/${session}/${person ?? status}/${roster}`,
      );
      if (input.groupId || input.archived || (person && input.query))
        throw new CommunityError("invalid_input");
      if (person)
        return respond(
          pageResult(
            (await attendance.history(
              user.id,
              org,
              activity,
              session,
              person,
              input,
            )) as { id: string; createdAt: string }[],
            input,
          ),
        );
      const [rows, summary] = await Promise.all([
        attendance.list(
          user.id,
          org,
          activity,
          session,
          input,
          status as AttendanceStatus | "all",
          roster as "all" | "registered" | "expected",
        ),
        attendance.summary(user.id, org, activity, session),
      ]);
      return respond({
        ...pageResult(rows as { id: string; createdAt: string }[], input),
        summary: summary[0],
      });
    }
    if (request.method !== "POST" || person)
      return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 16000) throw new CommunityError("invalid_input");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    const result = (
      await attendance.save(
        user.id,
        org,
        activity,
        session,
        attendanceInput(body),
      )
    )[0]?.result as { code?: string } | undefined;
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
    return respond(result);
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    throw error;
  }
}
