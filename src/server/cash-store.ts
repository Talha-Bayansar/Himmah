import { neon } from "@neondatabase/serverless";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { PageInput } from "../community/contracts.ts";
import type { CashView } from "../cash/contracts.ts";
const authorized = (
  user: string,
  org: string,
  activity: string,
  session: string,
) =>
  sql`hub_can_collect_session(${user},${org}::uuid,${activity}::uuid,${session}::uuid)`;
const charges = (
  user: string,
  org: string,
  activity: string,
  session: string,
) =>
  sql`charges as (select ch.id,c.display_name as name,ch.amount_minor as "amountMinor",(b.value->>'paidMinor')::int as "paidMinor",ch.amount_minor-(b.value->>'paidMinor')::int as "outstandingMinor",(b.value->>'version')::int as version,case when (b.value->>'paidMinor')::int=0 then 'unpaid' when (b.value->>'paidMinor')::int=ch.amount_minor then 'paid' else 'partial' end as status,(r.status='cancelled' or s.cancelled or a.cancelled) as "reviewRequired",ch.created_at::text as "createdAt" from hub_registration_charges ch join hub_session_registrations r on r.organization_id=ch.organization_id and r.id=ch.registration_id join himmah.contacts c on c.organization_id=r.organization_id and c.id=r.person_id join hub_activity_sessions s on s.organization_id=r.organization_id and s.id=r.session_id join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id cross join lateral (select hub_cash_balance(ch.organization_id,ch.id) as value) b where ch.organization_id=${org}::uuid and r.activity_id=${activity}::uuid and r.session_id=${session}::uuid and ${authorized(user, org, activity, session)} and hub_can_collect_person(${user},${org}::uuid,${activity}::uuid,${session}::uuid,r.person_id))`;
export type CashStore = ReturnType<typeof createCashStore>;
export function createCashStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url)),
    rows = async (s: SQL) =>
      execute
        ? execute(s)
        : ((await db.execute(s)).rows as Record<string, unknown>[]);
  return {
    summary: (user: string, org: string, activity: string, session: string) =>
      rows(
        sql`with ${charges(user, org, activity, session)} select s.name,s.timezone,hub_is_admin(${user},${org}::uuid) as "canManage",(not s.cancelled and not a.cancelled and s.price_minor>0) as "canRecord",coalesce((select sum("amountMinor") from charges),0)::float8 as "owedMinor",coalesce((select sum("paidMinor") from charges),0)::float8 as "paidMinor",coalesce((select sum("outstandingMinor") from charges),0)::float8 as "outstandingMinor",case when hub_is_admin(${user},${org}::uuid) then (select coalesce(sum(cr.amount_minor),0)::float8 from hub_cash_receipts cr where cr.organization_id=s.organization_id and cr.session_id=s.id and not exists(select 1 from hub_cash_reversals rev where rev.organization_id=cr.organization_id and rev.receipt_id=cr.id)) else null end as "collectedMinor",case when hub_is_admin(${user},${org}::uuid) then (select coalesce(sum(cr.amount_minor-(select coalesce(sum(ca.amount_minor),0) from hub_cash_allocations ca where ca.organization_id=cr.organization_id and ca.receipt_id=cr.id)),0)::float8 from hub_cash_receipts cr where cr.organization_id=s.organization_id and cr.session_id=s.id and not exists(select 1 from hub_cash_reversals rev where rev.organization_id=cr.organization_id and rev.receipt_id=cr.id)) else null end as "unallocatedMinor" from hub_activity_sessions s join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id where s.organization_id=${org}::uuid and s.activity_id=${activity}::uuid and s.id=${session}::uuid and ${authorized(user, org, activity, session)}`,
      ),
    list: (
      user: string,
      org: string,
      activity: string,
      session: string,
      p: PageInput,
      view: CashView,
      id?: string,
    ) =>
      rows(
        sql`with ${charges(user, org, activity, session)} select * from charges where name ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} ${id ? sql`and id=${id}::uuid` : sql``} ${view === "all" ? sql`` : view === "outstanding" ? sql`and "outstandingMinor">0 and not "reviewRequired"` : view === "review" ? sql`and "reviewRequired"` : sql`and status=${view}`} ${p.after ? sql`and ("createdAt"::timestamptz,id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by "createdAt"::timestamptz desc,id desc limit ${p.limit + 1}`,
      ),
    history: (
      user: string,
      org: string,
      activity: string,
      session: string,
      p: PageInput,
    ) =>
      rows(
        sql`select cr.id,cr.amount_minor as "amountMinor",(cr.amount_minor-(select coalesce(sum(ca.amount_minor),0) from hub_cash_allocations ca where ca.organization_id=cr.organization_id and ca.receipt_id=cr.id))::int as "unallocatedMinor",cr.payer_label as "payerLabel",hub_cash_actor_name(cr.created_by,cr.organization_id) as "collectorName",cr.occurred_at::text as "occurredAt",cr.created_at::text as "createdAt",rev.id is not null as reversed,rev.reason,rev.created_at::text as "reversedAt",hub_cash_actor_name(rev.created_by,cr.organization_id) as "reversedBy",coalesce((select jsonb_agg(jsonb_build_object('name',c.display_name,'amountMinor',ca.amount_minor) order by ca.charge_id) from hub_cash_allocations ca join hub_registration_charges ch on ch.organization_id=ca.organization_id and ch.id=ca.charge_id join hub_session_registrations r on r.organization_id=ch.organization_id and r.id=ch.registration_id join himmah.contacts c on c.organization_id=r.organization_id and c.id=r.person_id where ca.organization_id=cr.organization_id and ca.receipt_id=cr.id),'[]'::jsonb) as allocations from hub_cash_receipts cr left join hub_cash_reversals rev on rev.organization_id=cr.organization_id and rev.receipt_id=cr.id left join hub_memberships m on m.organization_id=cr.organization_id and m.user_id=cr.created_by where cr.organization_id=${org}::uuid and cr.activity_id=${activity}::uuid and cr.session_id=${session}::uuid and hub_is_admin(${user},${org}::uuid) and cr.payer_label ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} ${p.after ? sql`and (cr.created_at,cr.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by cr.created_at desc,cr.id desc limit ${p.limit + 1}`,
      ),
    command: (
      user: string,
      org: string,
      activity: string,
      session: string,
      key: string,
      payload: Record<string, unknown>,
    ) =>
      rows(
        sql`select hub_cash_command(${user},${org}::uuid,${activity}::uuid,${session}::uuid,${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
      ),
  };
}
