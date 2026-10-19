import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
import type { PointsInput } from "../points/contracts.ts";
export type PointsStore = ReturnType<typeof createPointsStore>;
export function createPointsStore(
  url: string,
  execute?: (statement: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  const rows = async (statement: SQL) =>
    execute
      ? execute(statement)
      : ((await db.execute(statement)).rows as Record<string, unknown>[]);
  return {
    anyAccess(user: string, org: string) {
      return rows(
        sql`select 1 as allowed where hub_is_admin(${user},${org}::uuid) or exists(select 1 from hub_active_access(${user},${org}::uuid) where can_award or can_attend)`,
      );
    },
    member(user: string, org: string, person: string) {
      return rows(
        sql`select hub_can_award(${user},${org}::uuid,p.id) as "canAward",p.id,p.name,p.archived,p.version,p.created_at::text as "createdAt",coalesce((select sum(amount) from hub_points_entries where organization_id=p.organization_id and person_id=p.id and hub_can_view_points(${user},${org}::uuid,id)),0)::text as balance from hub_people p where p.organization_id=${org}::uuid and p.id=${person}::uuid and hub_can_view_member(${user},${org}::uuid,p.id)`,
      );
    },
    history(user: string, org: string, person: string, p: PageInput) {
      return rows(
        sql`select hub_is_admin(${user},${org}::uuid) as "canCorrect",e.source,e.rule_version as "ruleVersion",e.id,e.person_id as "personId",e.amount,e.reason,e.occurred_at::text as "occurredAt",e.created_at::text as "createdAt",e.original_id as "originalId",o.reason as "originalReason",case when hub_can_view_activity(${user},${org}::uuid,e.activity_id) then e.activity_id else null end as "activityId",case when hub_can_view_session(${user},${org}::uuid,e.activity_id,e.session_id) then e.session_id else null end as "sessionId",m.display_name as "actorName",case when hub_can_view_activity(${user},${org}::uuid,e.activity_id) then a.name else null end as "activityName",case when hub_can_view_session(${user},${org}::uuid,e.activity_id,e.session_id) then s.name else null end as "sessionName",(e.amount+coalesce((select sum(amount) from hub_points_entries where organization_id=e.organization_id and person_id=e.person_id and original_id=e.id),0))::int as "currentAmount",(1+(select count(*) from hub_points_entries where organization_id=e.organization_id and person_id=e.person_id and original_id=e.id))::int as version from hub_points_entries e left join hub_points_entries o on o.organization_id=e.organization_id and o.person_id=e.person_id and o.id=e.original_id left join hub_memberships m on m.organization_id=e.organization_id and m.user_id=e.actor_id left join hub_activities a on a.organization_id=e.organization_id and a.id=e.activity_id left join hub_activity_sessions s on s.organization_id=e.organization_id and s.id=e.session_id where e.organization_id=${org}::uuid and e.person_id=${person}::uuid and hub_can_view_points(${user},${org}::uuid,e.id) ${p.after ? sql`and(e.created_at,e.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by e.created_at desc,e.id desc limit ${p.limit + 1}`,
      );
    },
    save(user: string, org: string, input: PointsInput) {
      const { key, ...payload } = input;
      return rows(
        sql`select hub_save_points(${user},${org}::uuid,${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
      );
    },
  };
}
