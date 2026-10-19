import {
  CommunityError,
  uuid,
  pageInput,
  pageResult,
} from "../community/contracts.ts";
import { pointsInput } from "../points/contracts.ts";
import type { OrganizationStore } from "./store.ts";
import type { PointsStore } from "./points-store.ts";
export async function pointsApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  points: PointsStore,
) {
  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/api\/organizations\/([0-9a-f-]{36})\/(?:points|members\/([0-9a-f-]{36})(?:\/(points))?)$/i,
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
      person = match[2] ? uuid(match[2]) : null;
    const membership = await organizations.get(user.id, org);
    if (!membership) throw new CommunityError("not_found", 404);
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (!["owner", "admin"].includes(membership.role))
      throw new CommunityError("forbidden", 403);
    if (request.method === "GET" && person) {
      const member = (await points.member(user.id, org, person))[0];
      if (!member) throw new CommunityError("not_found", 404);
      if (!match[3]) return respond({ item: member });
      const input = pageInput(url, `${user.id}:${org}/points/${person}`);
      if (input.query || input.archived || input.groupId)
        throw new CommunityError("invalid_input");
      return respond(
        pageResult(
          (await points.history(user.id, org, person, input)) as {
            id: string;
            createdAt: string;
          }[],
          input,
        ),
      );
    }
    if (request.method !== "POST" || person)
      return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 10000) throw new CommunityError("invalid_input");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    const result = (
      await points.save(user.id, org, pointsInput(body, membership.timezone))
    )[0]?.result as { code?: string } | undefined;
    if (!result) throw new CommunityError("service", 503);
    if (result.code)
      throw new CommunityError(
        result.code,
        result.code === "forbidden"
          ? 403
          : result.code === "not_found"
            ? 404
            : result.code === "invalid_input" || result.code === "points_date"
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
