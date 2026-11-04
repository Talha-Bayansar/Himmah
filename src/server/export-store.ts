import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import { insightsStatement, insightsGroupSession } from "./insights-store.ts";
import {
  EXPORT_ROWS,
  EXPORT_BYTES,
  type ExportFilters,
  type ExportContext,
  type ExportSnapshot,
} from "../exports/contracts.ts";
const iso = (value: SQL) =>
  sql`to_char(${value} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
function scope(user: string, org: string, f: ExportFilters) {
  return sql`authorized as materialized (
 select o.* from hub_organizations o where o.id=${org}::uuid and exists(select 1 from hub_memberships m where m.organization_id=o.id and m.user_id=${user} and m.role in ('owner','admin'))
 and (${f.activity || null}::uuid is null or exists(select 1 from hub_activities a where a.organization_id=o.id and a.id=${f.activity || null}::uuid))
 and (${f.group || null}::uuid is null or exists(select 1 from himmah.groups g where g.organization_id=o.id and g.id=${f.group || null}::uuid))
 and (${f.session || null}::uuid is null or exists(select 1 from hub_activity_sessions s where s.organization_id=o.id and s.activity_id=${f.activity || null}::uuid and s.id=${f.session || null}::uuid))
 ), bounds as(select *,${f.from}::date::timestamp at time zone timezone start_at,(${f.to}::date+1)::timestamp at time zone timezone end_at from authorized)`;
}
const metadata = (
  f: ExportFilters,
) => sql`b.name as "organizationName",b.timezone,
 (select name from hub_activities where organization_id=b.id and id=${f.activity || null}::uuid) as "activityName",
 (select name from himmah.groups where organization_id=b.id and id=${f.group || null}::uuid) as "groupName",
 (select coalesce(nullif(topic,''),name) from hub_activity_sessions where organization_id=b.id and id=${f.session || null}::uuid) as "sessionName"`;
const cohort = (org: string, f: ExportFilters, person: SQL, session: SQL) =>
  f.group
    ? sql`exists(select 1 from himmah.group_memberships gm where gm.organization_id=${org}::uuid and gm.group_id=${f.group}::uuid and gm.contact_id=${person} and gm.valid_from<=${session}.starts_at and (gm.valid_to is null or gm.valid_to>${session}.starts_at))`
    : sql`true`;
const activeAllocation = sql`not exists(select 1 from hub_cash_reversals rev where rev.organization_id=ca.organization_id and rev.receipt_id=ca.receipt_id) and not exists(select 1 from hub_cash_allocation_corrections x where x.organization_id=ca.organization_id and x.receipt_id=ca.receipt_id and x.charge_id=ca.charge_id)`;
const balance = (charge: SQL) =>
  sql`(select coalesce(sum(ca.amount_minor),0) from hub_cash_allocations ca where ca.organization_id=${charge}.organization_id and ca.charge_id=${charge}.id and ${activeAllocation})`;
const sessionFields = sql`s.id as "sessionId",a.name as "activity",s.name as "sessionName",s.topic,s.timezone as "sessionTimezone",${iso(sql`s.starts_at`)} as "startsAt",to_char(s.starts_at at time zone s.timezone,'YYYY-MM-DD"T"HH24:MI:SS') as "localStart",s.cancelled`;
function detailRows(org: string, f: ExportFilters): SQL {
  if (f.kind === "contacts")
    return sql`select c.id,c.created_at as "sortAt",c.display_name as name,c.given_name as "givenName",c.family_name as "familyName",c.archived_at is not null as archived,${iso(sql`c.created_at`)} as "createdAt",
 (select value from himmah.contact_methods m where m.organization_id=c.organization_id and m.contact_id=c.id and m.kind='email' and m.ended_at is null order by m.preferred desc,m.created_at,m.id limit 1) as email,
 (select value from himmah.contact_methods m where m.organization_id=c.organization_id and m.contact_id=c.id and m.kind='phone' and m.ended_at is null order by m.preferred desc,m.created_at,m.id limit 1) as phone,
 (select count(*)::int from himmah.group_memberships gm where gm.organization_id=c.organization_id and gm.contact_id=c.id and gm.valid_to is null) as "groupCount"
 from himmah.contacts c cross join bounds b where c.organization_id=b.id
 ${f.state === "all" ? sql`` : sql`and (c.archived_at is not null)=${f.state === "archived"}`}
 and (c.display_name ilike ${"%" + f.q.replace(/[\\%_]/g, "\\$&") + "%"} or c.given_name ilike ${"%" + f.q.replace(/[\\%_]/g, "\\$&") + "%"} or c.family_name ilike ${"%" + f.q.replace(/[\\%_]/g, "\\$&") + "%"})
 ${f.group ? sql`and exists(select 1 from himmah.group_memberships gm where gm.organization_id=c.organization_id and gm.contact_id=c.id and gm.group_id=${f.group}::uuid and gm.valid_to is null)` : sql``}`;
  const selected = f.session
    ? sql`s.id=${f.session}::uuid`
    : sql`s.starts_at>=b.start_at and s.starts_at<b.end_at ${f.activity ? sql`and s.activity_id=${f.activity}::uuid` : sql``}`;
  if (f.kind === "attendance")
    return sql`select p.session_id::text||':'||p.person_id::text as id,s.starts_at as "sortAt",c.id as "contactId",c.display_name as name,c.archived_at is not null as archived,${sessionFields},${iso(sql`p.updated_at`)} as "recordedAt",ch.amount_minor::text as "chargedMinor",case when ch.id is not null then ${balance(sql`ch`)}::text end as "paidMinor",case when ch.id is not null then (ch.amount_minor-${balance(sql`ch`)})::text end as "outstandingMinor"
 from bounds b join hub_activity_sessions s on s.organization_id=b.id join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id
 join hub_attendance p on p.organization_id=s.organization_id and p.session_id=s.id and p.status='present'
 join himmah.contacts c on c.organization_id=p.organization_id and c.id=p.person_id
 left join hub_registration_charges ch on ch.organization_id=p.organization_id and ch.session_id=p.session_id and ch.person_id=p.person_id
 where ${selected} ${f.session ? sql`` : sql`and not s.cancelled and s.starts_at<=statement_timestamp()`} and ${cohort(org, f, sql`c.id`, sql`s`)}`;
  if (f.kind === "balances")
    return sql`select ch.id,s.starts_at as "sortAt",c.id as "contactId",c.display_name as name,c.archived_at is not null as archived,${sessionFields},exists(select 1 from hub_attendance p where p.organization_id=s.organization_id and p.session_id=s.id and p.person_id=c.id and p.status='present') as present,ch.amount_minor::text as "chargedMinor",${balance(sql`ch`)}::text as "paidMinor",(ch.amount_minor-${balance(sql`ch`)})::text as "outstandingMinor"
 from bounds b join hub_activity_sessions s on s.organization_id=b.id join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id
 join hub_registration_charges ch on ch.organization_id=s.organization_id and ch.session_id=s.id join himmah.contacts c on c.organization_id=ch.organization_id and c.id=ch.person_id
 where ${selected} and ${cohort(org, f, sql`c.id`, sql`s`)} ${f.group && !f.session ? sql`and ${insightsGroupSession(org, f.group, sql`s`)}` : sql``}`;
  const groupCash = sql`(select coalesce(sum(ca.amount_minor),0) from hub_cash_allocations ca join hub_registration_charges ch on ch.organization_id=ca.organization_id and ch.id=ca.charge_id where ca.organization_id=cr.organization_id and ca.receipt_id=cr.id and ${activeAllocation} and ${cohort(org, f, sql`ch.person_id`, sql`s`)})`;
  return sql`select cr.id,cr.occurred_at as "sortAt",${sessionFields},${iso(sql`cr.occurred_at`)} as "occurredAt",hub_cash_actor_name(cr.created_by,cr.organization_id) as collector,
 (${f.group ? groupCash : sql`cr.amount_minor-hub_cash_receipt_corrected(cr.organization_id,cr.id)`})::text as "cashMinor",
 (${f.group ? sql`null` : sql`cr.amount_minor-(select coalesce(sum(ca.amount_minor),0) from hub_cash_allocations ca where ca.organization_id=cr.organization_id and ca.receipt_id=cr.id)`})::text as "unallocatedMinor"
 from bounds b join hub_cash_receipts cr on cr.organization_id=b.id join hub_activity_sessions s on s.organization_id=cr.organization_id and s.id=cr.session_id join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id
 where not exists(select 1 from hub_cash_reversals rev where rev.organization_id=cr.organization_id and rev.receipt_id=cr.id)
 ${f.session ? sql`and s.id=${f.session}::uuid` : sql`and cr.occurred_at>=b.start_at and cr.occurred_at<b.end_at ${f.activity ? sql`and cr.activity_id=${f.activity}::uuid` : sql``}`}
 ${f.group ? sql`and ${groupCash}>0` : sql``}`;
}
export function exportStatement(user: string, org: string, f: ExportFilters) {
  if (f.kind.startsWith("insights"))
    return sql`with report as (${insightsStatement(user, org, f, { limit: f.kind === "insights-activities" ? EXPORT_ROWS : 0, query: "", archived: false, after: null, groupId: "", scope: "exports" })}) select r.*,(select name from hub_organizations where id=${org}::uuid) as "organizationName",null::text as "sessionName" from report r`;
  return sql`with ${scope(user, org, f)}, all_rows as (${detailRows(org, f)}), bounded as materialized(select * from all_rows order by "sortAt",id limit ${EXPORT_ROWS + 1}), sized as(select count(*)>${EXPORT_ROWS} or coalesce(sum(pg_column_size(to_jsonb(r))),0)>${EXPORT_BYTES} as too_large from bounded r)
 select ${metadata(f)},${iso(sql`statement_timestamp()`)} as "generatedAt",(select too_large from sized) as "tooLarge",case when (select too_large from sized) then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(r) order by r."sortAt",r.id) from bounded r),'[]'::jsonb) end items from bounds b`;
}
export type ExportStore = ReturnType<typeof createExportStore>;
export function createExportStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = execute ? null : drizzle(neon(url)),
    run = (s: SQL) =>
      execute ? execute(s) : db!.execute(s).then((r) => r.rows);
  return {
    async context(user: string, org: string, f: ExportFilters) {
      return (
        await run(
          sql`with ${scope(user, org, f)} select ${metadata(f)} from bounds b`,
        )
      )[0] as ExportContext | undefined;
    },
    async data(user: string, org: string, f: ExportFilters) {
      return (await run(exportStatement(user, org, f)))[0] as
        ExportSnapshot | undefined;
    },
  };
}
