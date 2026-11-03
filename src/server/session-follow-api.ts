import { CommunityError, uuid } from "../community/contracts.ts";
import { followInput } from "../notifications/follow-contracts.ts";
import type { OrganizationStore } from "./store.ts";
import type { SessionFollowStore } from "./session-follow-store.ts";
export async function sessionFollowApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  follows: SessionFollowStore,
) {
  const match = new URL(request.url).pathname.match(
    /^\/api\/organizations\/([0-9a-f-]{36})\/activities\/([0-9a-f-]{36})(?:\/sessions\/([0-9a-f-]{36}))?\/follow$/i,
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
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    const org = uuid(match[1]),
      activity = uuid(match[2]),
      session = match[3] ? uuid(match[3]) : null;
    if (!(await organizations.get(user.id, org)))
      throw new CommunityError("not_found", 404);
    let result: Record<string, unknown> | null;
    if (request.method === "GET")
      result = (await follows.state(user.id, org, activity, session))[0]
        ?.result as Record<string, unknown> | null;
    else if (request.method === "POST") {
      const text = await request.text();
      if (text.length > 2000) throw new CommunityError("invalid_input");
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new CommunityError("invalid_input");
      }
      result = (
        await follows.set(user.id, org, activity, session, followInput(body))
      )[0]?.result as Record<string, unknown> | null;
    } else return respond({ code: "not_found" }, 404);
    if (!result) throw new CommunityError("not_found", 404);
    if (result.code)
      throw new CommunityError(
        String(result.code),
        result.code === "not_found"
          ? 404
          : [
                "version_conflict",
                "request_key_conflict",
                "follow_closed",
              ].includes(String(result.code))
            ? 409
            : 400,
      );
    return respond(result);
  } catch (error) {
    return error instanceof CommunityError
      ? respond({ code: error.code }, error.status)
      : respond({ code: "service" }, 503);
  }
}
