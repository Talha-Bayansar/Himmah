import {
  CommunityError,
  pageInput,
  pageResult,
  uuid,
} from "../community/contracts.ts";
import {
  followUpFilters,
  type FollowUpContact,
} from "../insights/follow-up.ts";
import type { FollowUpStore } from "./follow-up-store.ts";
import type { OrganizationStore } from "./store.ts";
export async function followUpApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: FollowUpStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/insights\/follow-up$/i,
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
    const org = uuid(match[1]);
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    const membership = await organizations.get(user.id, org);
    if (!membership) throw new CommunityError("not_found", 404);
    if (!["owner", "admin"].includes(membership.role))
      throw new CommunityError("forbidden", 403);
    if (request.method !== "GET") throw new CommunityError("not_found", 404);
    const filters = followUpFilters(Object.fromEntries(url.searchParams)),
      p = pageInput(
        url,
        `${user.id}:${org}/follow-up/${JSON.stringify(filters)}`,
      );
    if (p.groupId || p.archived) throw new CommunityError("invalid_input");
    const report = (await store.get(user.id, org, filters, p))[0];
    if (!report) throw new CommunityError("forbidden", 403);
    return respond({
      ...report,
      ...pageResult(report.items as FollowUpContact[], p, (row) =>
        filters.view === "recent" ? row.lastVisit! : row.createdAt,
      ),
    });
  } catch (e) {
    if (e instanceof CommunityError) return respond({ code: e.code }, e.status);
    throw e;
  }
}
