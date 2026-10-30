import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";

const authorized = (
  user: string,
  org: string,
) => sql`select id from hub_organizations o where o.id=${org}::uuid
 and exists(select 1 from hub_memberships m where m.organization_id=o.id and m.user_id=${user})`;
// The preview and full agenda share visibility, current-session and cancellation rules.
const upcoming = (user: string, p?: PageInput) => sql`
 select s.id,s.activity_id as "activityId",s.name,s.topic,s.location,s.starts_at::text as "startsAt",s.ends_at::text as "endsAt",s.timezone,
 hub_can_attend_session(${user},s.organization_id,s.activity_id,s.id) as "canAttend",
 hub_can_collect_session(${user},s.organization_id,s.activity_id,s.id) as "canCollect"
 from hub_activity_sessions s join authorized o on o.id=s.organization_id
 join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id
 where not s.cancelled and not a.cancelled and s.ends_at>statement_timestamp()
 and hub_can_view_session(${user},s.organization_id,s.activity_id,s.id)
 ${p?.query ? sql`and (s.name ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} or s.topic ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} or s.location ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"})` : sql``}
 ${p?.after ? sql`and (s.starts_at,s.id)>(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``}
 order by s.starts_at,s.id limit ${p ? p.limit + 1 : 3}`;

export function dashboardStatement(user: string, org: string) {
  return sql`with authorized as materialized (${authorized(user, org)}), upcoming as (${upcoming(user)})
 select to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "generatedAt",
 coalesce((select jsonb_agg(to_jsonb(u) order by u."startsAt"::timestamptz,u.id) from upcoming u),'[]'::jsonb) as items from authorized`;
}
export function plannedSessionsStatement(
  user: string,
  org: string,
  p: PageInput,
) {
  return sql`with authorized as materialized (${authorized(user, org)}) ${upcoming(user, p)}`;
}
export type DashboardStore = ReturnType<typeof createDashboardStore>;
export function createDashboardStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  const rows = (s: SQL) =>
    execute ? execute(s) : db.execute(s).then((r) => r.rows);
  return {
    get: (user: string, org: string) => rows(dashboardStatement(user, org)),
    sessions: (user: string, org: string, p: PageInput) =>
      rows(plannedSessionsStatement(user, org, p)),
  };
}
