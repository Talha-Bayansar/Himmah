import { CommunityError, uuid } from "../community/contracts.ts";
import type { OrganizationStore } from "./store.ts";
import type { DashboardStore } from "./dashboard-store.ts";
export async function dashboardApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: DashboardStore,
) {
  const match = new URL(request.url).pathname.match(
    /^\/api\/organizations\/([0-9a-f-]{36})\/dashboard$/i,
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
    const org = uuid(match[1]);
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (!(await organizations.get(user.id, org)))
      throw new CommunityError("not_found", 404);
    if (request.method !== "GET") throw new CommunityError("not_found", 404);
    const report = (await store.get(user.id, org))[0];
    if (!report) throw new CommunityError("forbidden", 403);
    return respond(report);
  } catch (e) {
    if (e instanceof CommunityError) return respond({ code: e.code }, e.status);
    throw e;
  }
}
