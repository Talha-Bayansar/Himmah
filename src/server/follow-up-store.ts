import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
import type { FollowUpFilters } from "../insights/follow-up.ts";
export function followUpStatement(
  user: string,
  org: string,
  f: FollowUpFilters,
  p: PageInput,
) {
  return sql`with authorized as materialized (
 select o.id,o.timezone from hub_organizations o where o.id=${org}::uuid and exists(select 1 from hub_memberships m where m.organization_id=o.id and m.user_id=${user} and m.role in ('owner','admin'))
 ), bounds as(select *, ((statement_timestamp() at time zone timezone)::date-${f.days - 1}::int) as since,
 (((statement_timestamp() at time zone timezone)::date-${f.days - 1}::int)::timestamp at time zone timezone) as start_at from authorized),
 last_visits as materialized (
 select distinct on(a.person_id) a.person_id,s.id,s.activity_id,s.starts_at,s.topic,s.name
 from bounds b join hub_attendance a on a.organization_id=b.id and a.status='present'
 join hub_activity_sessions s on s.organization_id=a.organization_id and s.id=a.session_id
 where not s.cancelled and s.starts_at<=statement_timestamp()
 order by a.person_id,s.starts_at desc,s.id desc
 ), contacts as materialized (
 select c.id,c.display_name as name,c.created_at as created_at,v.starts_at as last_visit,v.topic,v.name as activity_name
 from bounds b join himmah.contacts c on c.organization_id=b.id and c.archived_at is null
 left join last_visits v on v.person_id=c.id
 where c.display_name ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"}
 ), matched as materialized (
 select c.* from contacts c cross join bounds b where ${f.view === "never" ? sql`c.last_visit is null` : sql`c.last_visit is not null and c.last_visit<b.start_at`}
 ), page as (
 select id,name,created_at::text as "createdAt",last_visit::text as "lastVisit",topic as "lastTopic",activity_name as "lastActivity"
 from matched ${p.after ? (f.view === "recent" ? sql`where (last_visit,id)>(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql`where (created_at,id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)`) : sql``}
 order by ${f.view === "recent" ? sql`last_visit asc,id asc` : sql`created_at desc,id desc`} limit ${p.limit + 1})
 select b.timezone,b.since::text as since,to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "generatedAt",
 jsonb_build_object('recent',(select count(*) from contacts c where c.last_visit<b.start_at),'never',(select count(*) from contacts c where c.last_visit is null)) as summary,
 coalesce((select jsonb_agg(to_jsonb(p) order by ${f.view === "recent" ? sql`p."lastVisit"::timestamptz asc,p.id asc` : sql`p."createdAt"::timestamptz desc,p.id desc`}) from page p),'[]'::jsonb) as items from bounds b`;
}
export type FollowUpStore = ReturnType<typeof createFollowUpStore>;
export function createFollowUpStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  return {
    get: (user: string, org: string, f: FollowUpFilters, p: PageInput) => {
      const s = followUpStatement(user, org, f, p);
      return execute ? execute(s) : db.execute(s).then((r) => r.rows);
    },
  };
}
