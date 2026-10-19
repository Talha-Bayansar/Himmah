import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
import type { PointsInput } from "../points/contracts.ts";
const actor = (user: string, org: string) =>
  sql`exists(select 1 from hub_memberships where organization_id=${org}::uuid and user_id=${user} and role in ('owner','admin'))`;
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
    member(user: string, org: string, person: string) {
      return rows(
        sql`select p.id,p.name,p.archived,p.version,p.created_at::text as "createdAt",coalesce((select sum(amount) from hub_points_entries where organization_id=p.organization_id and person_id=p.id),0)::text as balance from hub_people p where p.organization_id=${org}::uuid and p.id=${person}::uuid and ${actor(user, org)}`,
      );
    },
    history(user: string, org: string, person: string, p: PageInput) {
      return rows(
        sql`select e.id,e.person_id as "personId",e.amount,e.reason,e.occurred_at::text as "occurredAt",e.created_at::text as "createdAt",e.original_id as "originalId",o.reason as "originalReason",e.activity_id as "activityId",e.session_id as "sessionId",m.display_name as "actorName",a.name as "activityName",s.name as "sessionName",(e.amount+coalesce((select sum(amount) from hub_points_entries where organization_id=e.organization_id and person_id=e.person_id and original_id=e.id),0))::int as "currentAmount",(1+(select count(*) from hub_points_entries where organization_id=e.organization_id and person_id=e.person_id and original_id=e.id))::int as version from hub_points_entries e left join hub_points_entries o on o.organization_id=e.organization_id and o.person_id=e.person_id and o.id=e.original_id left join hub_memberships m on m.organization_id=e.organization_id and m.user_id=e.actor_id left join hub_activities a on a.organization_id=e.organization_id and a.id=e.activity_id left join hub_activity_sessions s on s.organization_id=e.organization_id and s.id=e.session_id where e.organization_id=${org}::uuid and e.person_id=${person}::uuid and ${actor(user, org)} ${p.after ? sql`and(e.created_at,e.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by e.created_at desc,e.id desc limit ${p.limit + 1}`,
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
