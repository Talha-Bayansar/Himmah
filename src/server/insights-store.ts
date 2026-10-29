import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
import type { InsightsFilters } from "../insights/contracts.ts";

// One statement/snapshot; both the API and this read boundary enforce organization-wide reporting access.
export function insightsStatement(
  user: string,
  org: string,
  f: InsightsFilters,
  p: PageInput,
) {
  const member = (person: SQL, session: SQL) =>
    f.group
      ? sql`exists(select 1 from himmah.group_memberships gm where gm.organization_id=${org}::uuid and gm.group_id=${f.group}::uuid and gm.contact_id=${person} and gm.valid_from<=${session}.starts_at and (gm.valid_to is null or gm.valid_to>${session}.starts_at))`
      : sql`true`;
  return sql`with authorized as materialized (
 select o.* from hub_organizations o where o.id=${org}::uuid and exists(select 1 from hub_memberships m where m.organization_id=o.id and m.user_id=${user} and m.role in ('owner','admin'))
 and (${f.activity || null}::uuid is null or exists(select 1 from hub_activities a where a.organization_id=o.id and a.id=${f.activity || null}::uuid))
 and (${f.group || null}::uuid is null or exists(select 1 from himmah.groups g where g.organization_id=o.id and g.id=${f.group || null}::uuid))
 ), bounds as(select *, ${f.from}::date as first_day,${f.to}::date as last_day,
 ${f.from}::date::timestamp at time zone timezone as start_at,(${f.to}::date+1)::timestamp at time zone timezone as end_at,
 (${f.from}::date-(${f.to}::date-${f.from}::date+1))::timestamp at time zone timezone as previous_at from authorized),
 scoped_sessions as materialized(select s.*,(s.starts_at at time zone b.timezone)::date as local_day from hub_activity_sessions s cross join bounds b
 where s.organization_id=b.id and s.starts_at>=b.previous_at and s.starts_at<b.end_at
 ${f.activity ? sql`and s.activity_id=${f.activity}::uuid` : sql``}
 ${f.group ? sql`and (${f.group}::uuid=any(s.audience_group_ids) or exists(select 1 from hub_attendance x where x.organization_id=s.organization_id and x.session_id=s.id and x.status='present' and ${member(sql`x.person_id`, sql`s`)}) or exists(select 1 from hub_session_registrations r where r.organization_id=s.organization_id and r.session_id=s.id and r.status='confirmed' and ${member(sql`r.person_id`, sql`s`)}))` : sql``}),
 sessions as materialized(select * from scoped_sessions where not cancelled and starts_at<=statement_timestamp()),
 financial_sessions as materialized(select s.* from scoped_sessions s,bounds b where s.starts_at>=b.start_at),
 current_sessions as materialized(select s.* from sessions s,bounds b where s.starts_at>=b.start_at),
 presence as materialized(select a.person_id,s.id as session_id,s.activity_id,s.starts_at,s.local_day from sessions s join hub_attendance a on a.organization_id=s.organization_id and a.session_id=s.id and a.status='present' where ${member(sql`a.person_id`, sql`s`)}),
 current_presence as materialized(select p.* from presence p,bounds b where p.starts_at>=b.start_at),
 earlier as materialized(select distinct a.person_id from bounds b join hub_attendance a on a.organization_id=b.id and a.status='present' join hub_activity_sessions old on old.organization_id=a.organization_id and old.id=a.session_id join (select distinct person_id from current_presence) target on target.person_id=a.person_id where not old.cancelled and old.starts_at<b.start_at),
 charges as materialized(select ch.* from hub_registration_charges ch join financial_sessions s on s.organization_id=ch.organization_id and s.id=ch.session_id where ${member(sql`ch.person_id`, sql`s`)}),
 paid as materialized(select ca.charge_id,sum(ca.amount_minor)::bigint as amount from charges ch join hub_cash_allocations ca on ca.organization_id=ch.organization_id and ca.charge_id=ch.id
 where not exists(select 1 from hub_cash_reversals rev where rev.organization_id=ca.organization_id and rev.receipt_id=ca.receipt_id) and not exists(select 1 from hub_cash_allocation_corrections x where x.organization_id=ca.organization_id and x.receipt_id=ca.receipt_id and x.charge_id=ca.charge_id) group by ca.charge_id),
 activity_rows as(select a.id,a.name,a.created_at::text as "createdAt",(select count(*)::int from current_sessions s where s.activity_id=a.id) as sessions,
 (select count(*)::int from current_presence cp where cp.activity_id=a.id) as visits,
 (select count(distinct cp.person_id)::int from current_presence cp where cp.activity_id=a.id) as unique,
 (select coalesce(sum(ch.amount_minor),0)::float8 from charges ch where ch.activity_id=a.id) as "chargedMinor",
 (select coalesce(sum(paid.amount),0)::float8 from charges ch left join paid on paid.charge_id=ch.id where ch.activity_id=a.id) as "paidMinor",
 (select coalesce(sum(ch.amount_minor-coalesce(paid.amount,0)),0)::float8 from charges ch left join paid on paid.charge_id=ch.id where ch.activity_id=a.id) as "outstandingMinor"
 from hub_activities a where a.organization_id=${org}::uuid and (exists(select 1 from current_sessions s where s.activity_id=a.id) or exists(select 1 from charges ch where ch.activity_id=a.id))),
 activity_page as(select * from activity_rows ${p.after ? sql`where ("createdAt"::timestamptz,id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by "createdAt"::timestamptz desc,id desc limit ${p.limit + 1})
 select (select name from hub_activities where organization_id=b.id and id=${f.activity || null}::uuid) as "activityName",(select name from himmah.groups where organization_id=b.id and id=${f.group || null}::uuid) as "groupName",b.timezone,to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "generatedAt",coalesce((select jsonb_agg(to_jsonb(ap) order by ap."createdAt"::timestamptz desc,ap.id desc) from activity_page ap),'[]'::jsonb) as items,
 ${
   p.after
     ? sql`null::jsonb as summary,'[]'::jsonb as trend`
     : sql`
 jsonb_build_object('sessions',(select count(*) from current_sessions),'visits',(select count(*) from current_presence),'unique',(select count(distinct person_id) from current_presence),
 'first',(select count(distinct cp.person_id) from current_presence cp where not exists(select 1 from earlier e where e.person_id=cp.person_id)),
 'returning',(select count(distinct cp.person_id) from current_presence cp where exists(select 1 from earlier e where e.person_id=cp.person_id)),
 'registrations',(select count(*) from hub_session_registrations r join current_sessions s on s.organization_id=r.organization_id and s.id=r.session_id where r.status='confirmed' and ${member(sql`r.person_id`, sql`s`)}),
 'registeredPresent',(select count(*) from current_presence cp where exists(select 1 from hub_session_registrations r where r.organization_id=b.id and r.session_id=cp.session_id and r.person_id=cp.person_id and r.status='confirmed')),
 'walkIns',(select count(*) from current_presence cp where not exists(select 1 from hub_session_registrations r where r.organization_id=b.id and r.session_id=cp.session_id and r.person_id=cp.person_id and r.status='confirmed')),
 'previousVisits',(select count(*) from presence p where p.starts_at<b.start_at),'previousFrom',(b.first_day-(b.last_day-b.first_day+1))::text,'previousTo',(b.first_day-1)::text,
 'chargedMinor',(select coalesce(sum(amount_minor),0)::float8 from charges),
 'paidMinor',(select coalesce(sum(paid.amount),0)::float8 from charges ch left join paid on paid.charge_id=ch.id),
 'outstandingMinor',(select coalesce(sum(ch.amount_minor-coalesce(paid.amount,0)),0)::float8 from charges ch left join paid on paid.charge_id=ch.id),
 'cashMinor',${f.group ? sql`(select coalesce(sum(ca.amount_minor),0)::float8 from hub_cash_receipts cr join hub_cash_allocations ca on ca.organization_id=cr.organization_id and ca.receipt_id=cr.id join hub_registration_charges ch on ch.organization_id=ca.organization_id and ch.id=ca.charge_id join hub_activity_sessions s on s.organization_id=ch.organization_id and s.id=ch.session_id where cr.organization_id=b.id and cr.occurred_at>=b.start_at and cr.occurred_at<b.end_at ${f.activity ? sql`and cr.activity_id=${f.activity}::uuid` : sql``} and ${member(sql`ch.person_id`, sql`s`)} and not exists(select 1 from hub_cash_reversals rev where rev.organization_id=cr.organization_id and rev.receipt_id=cr.id) and not exists(select 1 from hub_cash_allocation_corrections x where x.organization_id=ca.organization_id and x.receipt_id=ca.receipt_id and x.charge_id=ca.charge_id))` : sql`(select coalesce(sum(cr.amount_minor-hub_cash_receipt_corrected(cr.organization_id,cr.id)),0)::float8 from hub_cash_receipts cr where cr.organization_id=b.id and cr.occurred_at>=b.start_at and cr.occurred_at<b.end_at ${f.activity ? sql`and cr.activity_id=${f.activity}::uuid` : sql``} and not exists(select 1 from hub_cash_reversals rev where rev.organization_id=cr.organization_id and rev.receipt_id=cr.id))`},
 'unallocatedMinor',${f.group ? sql`null` : sql`(select coalesce(sum(cr.amount_minor-(select coalesce(sum(ca.amount_minor),0) from hub_cash_allocations ca where ca.organization_id=cr.organization_id and ca.receipt_id=cr.id)),0)::float8 from hub_cash_receipts cr where cr.organization_id=b.id and cr.occurred_at>=b.start_at and cr.occurred_at<b.end_at ${f.activity ? sql`and cr.activity_id=${f.activity}::uuid` : sql``} and not exists(select 1 from hub_cash_reversals rev where rev.organization_id=cr.organization_id and rev.receipt_id=cr.id))`}
 ) as summary,
 (select coalesce(jsonb_agg(jsonb_build_object('date',greatest(d::date,b.first_day)::text,'visits',(select count(*) from current_presence cp where date_trunc(${f.bucket},cp.local_day::timestamp)=d),'unique',(select count(distinct cp.person_id) from current_presence cp where date_trunc(${f.bucket},cp.local_day::timestamp)=d)) order by d),'[]'::jsonb) from generate_series(date_trunc(${f.bucket},b.first_day::timestamp),date_trunc(${f.bucket},b.last_day::timestamp),${f.bucket === "week" ? "1 week" : "1 month"}::interval) d) as trend`
 }
 from bounds b`;
}
export type InsightsStore = ReturnType<typeof createInsightsStore>;
export function createInsightsStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  const rows = (s: SQL) =>
    execute ? execute(s) : db.execute(s).then((r) => r.rows);
  return {
    report: (user: string, org: string, f: InsightsFilters, p: PageInput) =>
      rows(insightsStatement(user, org, f, p)),
    options: (
      user: string,
      org: string,
      kind: "activities" | "groups",
      p: PageInput,
    ) =>
      rows(
        sql`select id,name,${kind === "activities" ? sql`cancelled` : sql`archived_at is not null`} as archived,created_at::text as "createdAt" from ${kind === "activities" ? sql`hub_activities` : sql`himmah.groups`} where organization_id=${org}::uuid and exists(select 1 from hub_memberships where organization_id=${org}::uuid and user_id=${user} and role in ('owner','admin')) and name ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} ${p.after ? sql`and (created_at,id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by created_at desc,id desc limit ${p.limit + 1}`,
      ),
  };
}
