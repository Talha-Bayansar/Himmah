import {
  CommunityError,
  pageInput,
  pageResult,
  uuid,
} from "../community/contracts.ts";
import { insightsFilters } from "../insights/contracts.ts";
import type { InsightsStore } from "./insights-store.ts";
import type { OrganizationStore } from "./store.ts";
export async function insightsApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: InsightsStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/insights(?:\/(options))?$/i,
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
    if (match[2]) {
      const kind = url.searchParams.get("kind");
      if (kind !== "activities" && kind !== "groups")
        throw new CommunityError("invalid_input");
      const p = pageInput(url, `${user.id}:${org}/insights/options/${kind}`);
      if (p.groupId || p.archived) throw new CommunityError("invalid_input");
      return respond(
        pageResult(
          (await store.options(user.id, org, kind, p)) as {
            id: string;
            createdAt: string;
          }[],
          p,
        ),
      );
    }
    const filters = insightsFilters(
      Object.fromEntries(url.searchParams),
      membership.timezone,
    );
    const p = pageInput(
      url,
      `${user.id}:${org}/insights/${JSON.stringify(filters)}`,
    );
    // 'group' is a report cohort filter, not a directory membership filter.
    if (p.archived || p.query) throw new CommunityError("invalid_input");
    const row = (await store.report(user.id, org, filters, p))[0];
    if (!row) {
      const current = await organizations.get(user.id, org);
      if (!current || !["owner", "admin"].includes(current.role))
        throw new CommunityError("forbidden", 403);
      throw new CommunityError("insights_filter", 400);
    }
    const page = pageResult(
      row.items as { id: string; createdAt: string }[],
      p,
    );
    return respond({ ...row, ...page, filters });
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    throw error;
  }
}
