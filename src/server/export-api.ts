import { CommunityError, uuid } from "../community/contracts.ts";
import { exportFilters } from "../exports/contracts.ts";
import { exportCsv } from "../exports/csv.ts";
import type { OrganizationStore } from "./store.ts";
import type { ExportStore } from "./export-store.ts";
export async function exportApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: ExportStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/exports(?:\/(context))?$/i,
    );
  if (!match) return null;
  const headers = {
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  const respond = (value: unknown, status = 200) =>
    Response.json(value, { status, headers });
  try {
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    const org = uuid(match[1]),
      member = await organizations.get(user.id, org);
    if (!member) throw new CommunityError("not_found", 404);
    if (!["owner", "admin"].includes(member.role))
      throw new CommunityError("forbidden", 403);
    if (request.method !== "GET") throw new CommunityError("not_found", 404);
    if (
      [...url.searchParams.keys()].some(
        (k) => url.searchParams.getAll(k).length !== 1,
      )
    )
      throw new CommunityError("invalid_input");
    const f = exportFilters(
      Object.fromEntries(url.searchParams),
      member.timezone,
    );
    const result = match[2]
      ? await store.context(user.id, org, f)
      : await store.data(user.id, org, f);
    if (!result) {
      const current = await organizations.get(user.id, org);
      if (!current || !["owner", "admin"].includes(current.role))
        throw new CommunityError("forbidden", 403);
      throw new CommunityError("insights_filter", 400);
    }
    if (match[2]) return respond(result);
    const snapshot = result as Awaited<ReturnType<ExportStore["data"]>>;
    if (!snapshot) throw new CommunityError("service", 503);
    const { csv, rowCount } = exportCsv(snapshot, f);
    const filename = `himmah-${f.kind}-${f.kind === "contacts" ? f.state : f.session ? "session" : f.from + "_" + f.to}-${f.locale}.csv`;
    return new Response(csv, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Language": f.locale,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Himmah-Export-Rows": String(rowCount),
        "X-Himmah-Generated-At": snapshot.generatedAt,
      },
    });
  } catch (error) {
    return error instanceof CommunityError
      ? respond({ code: error.code }, error.status)
      : respond({ code: "service" }, 503);
  }
}
