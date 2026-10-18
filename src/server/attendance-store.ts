import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
import type {
  AttendanceInput,
  AttendanceStatus,
} from "../attendance/contracts.ts";
const actor = (user: string, org: string) =>
  sql`actor as(select role from hub_memberships where organization_id=${org}::uuid and user_id=${user} and role in ('owner','admin'))`;
const roster = (org: string, activity: string, session: string) =>
  sql`session as(select * from hub_activity_sessions where organization_id=${org}::uuid and activity_id=${activity}::uuid and id=${session}::uuid and exists(select 1 from actor)), roster as(select p.id,p.name,p.created_at,p.archived, (not p.archived and (cardinality(s.audience_group_ids)=0 or exists(select 1 from hub_group_people gp where gp.organization_id=${org}::uuid and gp.person_id=p.id and gp.group_id=any(s.audience_group_ids)))) as eligible,coalesce(a.status,'unmarked') as status,coalesce(a.version,0) as version from hub_people p cross join session s left join hub_attendance a on a.organization_id=${org}::uuid and a.session_id=${session}::uuid and a.person_id=p.id where p.organization_id=${org}::uuid), visible as(select * from roster where eligible or version>0)`;
export type AttendanceStore = ReturnType<typeof createAttendanceStore>;
export function createAttendanceStore(
  url: string,
  execute?: (statement: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  const rows = async (statement: SQL) =>
    execute
      ? execute(statement)
      : ((await db.execute(statement)).rows as Record<string, unknown>[]);
  return {
    list(
      user: string,
      org: string,
      activity: string,
      session: string,
      p: PageInput,
      status: AttendanceStatus | "all",
    ) {
      return rows(
        sql`with ${actor(user, org)},${roster(org, activity, session)} select id,name,created_at::text as "createdAt",archived,eligible,status,version from visible where name ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} ${status === "all" ? sql`` : sql`and status=${status}`} ${p.after ? sql`and (created_at,id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    summary(user: string, org: string, activity: string, session: string) {
      return rows(
        sql`with ${actor(user, org)},${roster(org, activity, session)} select count(*)::int as total,count(*) filter(where status='present')::int as present,count(*) filter(where status='absent')::int as absent,count(*) filter(where status='excused')::int as excused,count(*) filter(where status='unmarked')::int as unmarked,coalesce((select not cancelled and starts_at<=clock_timestamp() from session),false) as "canEdit",(select cancelled from session) as cancelled,(select starts_at::text from session) as "startsAt" from visible`,
      );
    },
    history(
      user: string,
      org: string,
      activity: string,
      session: string,
      person: string,
      p: PageInput,
    ) {
      return rows(
        sql`with ${actor(user, org)} select c.id,to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",c.before_status as "beforeStatus",c.after_status as "afterStatus",c.reason,c.version,m.display_name as "actorName" from hub_attendance_changes c join hub_activity_sessions s on s.organization_id=c.organization_id and s.id=c.session_id left join hub_memberships m on m.organization_id=c.organization_id and m.user_id=c.actor_id where c.organization_id=${org}::uuid and s.activity_id=${activity}::uuid and c.session_id=${session}::uuid and c.person_id=${person}::uuid and exists(select 1 from actor) ${p.after ? sql`and (c.created_at,c.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by c.created_at desc,c.id desc limit ${p.limit + 1}`,
      );
    },
    save(
      user: string,
      org: string,
      activity: string,
      session: string,
      v: AttendanceInput,
    ) {
      return rows(
        sql`select hub_save_attendance(${user},${org}::uuid,${activity}::uuid,${session}::uuid,${v.key}::uuid,${JSON.stringify({ status: v.status, reason: v.reason, items: v.items })}::jsonb) as result`,
      );
    },
  };
}
