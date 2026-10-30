import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";

// Bounded chronological preview, including sessions currently in progress.
// SQL independently enforces membership and the existing session visibility scope.
export function dashboardStatement(user: string, org: string) {
  return sql`with authorized as materialized (
    select id from hub_organizations o where o.id=${org}::uuid
    and exists(select 1 from hub_memberships m where m.organization_id=o.id and m.user_id=${user})
  ), upcoming as (
    select s.id,s.activity_id as "activityId",s.name,s.location,s.starts_at as "startsAt",s.ends_at as "endsAt",s.timezone,
    hub_can_attend_session(${user},s.organization_id,s.activity_id,s.id) as "canAttend",
    hub_can_collect_session(${user},s.organization_id,s.activity_id,s.id) as "canCollect"
    from hub_activity_sessions s join authorized o on o.id=s.organization_id
    join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id
    where not s.cancelled and not a.cancelled and s.ends_at>statement_timestamp()
    and hub_can_view_session(${user},s.organization_id,s.activity_id,s.id)
    order by s.starts_at,s.id limit 3
  ) select to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "generatedAt",
    coalesce((select jsonb_agg(to_jsonb(u) order by u."startsAt",u.id) from upcoming u),'[]'::jsonb) as items
    from authorized`;
}
export type DashboardStore = ReturnType<typeof createDashboardStore>;
export function createDashboardStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  return {
    get: (user: string, org: string) => {
      const s = dashboardStatement(user, org);
      return execute ? execute(s) : db.execute(s).then((r) => r.rows);
    },
  };
}
