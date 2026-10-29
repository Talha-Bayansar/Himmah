import { neon } from "@neondatabase/serverless";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { PageInput } from "../community/contracts.ts";
import type { RegistrationView } from "../registration/contracts.ts";
const pattern = (q: string) => "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
const cursor = (p: PageInput, at: SQL, id: SQL) =>
  p.after
    ? sql`and (${at},${id})<(${p.after.at}::timestamptz,${p.after.id}::uuid)`
    : sql``;
export type RegistrationStore = ReturnType<typeof createRegistrationStore>;
export function createRegistrationStore(
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
        sql`select hub_registration_summary(${user},${org}::uuid,${activity}::uuid,${session}::uuid) as result`,
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
        sql`select hub_registration_command(${user},${org}::uuid,${activity}::uuid,${session}::uuid,${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
      ),
    options: (
      user: string,
      org: string,
      activity: string,
      session: string,
      p: PageInput,
    ) =>
      rows(
        sql`select c.id,c.name,c.version as "contactVersion",coalesce(r.version,0) as version,c.created_at::text as "createdAt" from himmah.activity_contacts c join hub_activity_sessions s on s.organization_id=c.organization_id and s.activity_id=${activity}::uuid and s.id=${session}::uuid left join hub_session_registrations r on r.organization_id=c.organization_id and r.session_id=s.id and r.person_id=c.id where c.organization_id=${org}::uuid and not c.archived and hub_can_attend_session(${user},${org}::uuid,${activity}::uuid,${session}::uuid) and hub_can_attend_person(${user},${org}::uuid,${activity}::uuid,${session}::uuid,c.id) and (cardinality(s.audience_group_ids)=0 or exists(select 1 from himmah.activity_memberships gm where gm.organization_id=c.organization_id and gm.person_id=c.id and gm.group_id=any(s.audience_group_ids))) and coalesce(r.status,'')<>'confirmed' and c.name ilike ${pattern(p.query)} ${cursor(p, sql`c.created_at`, sql`c.id`)} order by c.created_at desc,c.id desc limit ${p.limit + 1}`,
      ),
    list(
      user: string,
      org: string,
      activity: string,
      session: string,
      p: PageInput,
      view: RegistrationView,
    ) {
      if (view === "history")
        return rows(
          sql`select e.id,c.display_name as name,e.action,e.reason,m.display_name as "actorName",e.created_at::text as "createdAt" from hub_session_registration_events e left join himmah.contacts c on c.organization_id=e.organization_id and c.id=e.person_id left join hub_memberships m on m.organization_id=e.organization_id and m.user_id=e.actor_id where e.organization_id=${org}::uuid and e.activity_id=${activity}::uuid and e.session_id=${session}::uuid and hub_is_admin(${user},${org}::uuid) and coalesce(c.display_name,e.action) ilike ${pattern(p.query)} ${cursor(p, sql`e.created_at`, sql`e.id`)} order by e.created_at desc,e.id desc limit ${p.limit + 1}`,
        );
      return rows(
        sql`select case when hub_is_admin(${user},${org}::uuid) then (select jsonb_build_object('amountMinor',ch.amount_minor,'currency',ch.currency,'paidMinor',(hub_cash_balance(ch.organization_id,ch.id)->>'paidMinor')::int,'reviewRequired',r.status='cancelled' or exists(select 1 from hub_activity_sessions fs where fs.organization_id=r.organization_id and fs.id=r.session_id and fs.cancelled) or exists(select 1 from hub_activities fa where fa.organization_id=r.organization_id and fa.id=r.activity_id and fa.cancelled)) from hub_registration_charges ch where ch.organization_id=r.organization_id and ch.registration_id=r.id) else null end as charge,r.id,r.person_id as "personId",c.display_name as name,r.status,r.source,r.version,r.created_at::text as "createdAt",e.initial,e.included from hub_session_registrations r join himmah.contacts c on c.organization_id=r.organization_id and c.id=r.person_id left join hub_session_registration_settings policy on policy.organization_id=r.organization_id and policy.session_id=r.session_id left join hub_session_expected_contacts e on e.organization_id=r.organization_id and e.session_id=r.session_id and e.person_id=r.person_id where r.organization_id=${org}::uuid and r.activity_id=${activity}::uuid and r.session_id=${session}::uuid and hub_can_attend_session(${user},${org}::uuid,${activity}::uuid,${session}::uuid) and hub_can_attend_person(${user},${org}::uuid,${activity}::uuid,${session}::uuid,r.person_id) and ${view === "confirmed" || view === "cancelled" ? sql`r.status=${view}` : sql`policy.mode='required' and (case when policy.frozen_at is null then r.status='confirmed' else ${view === "original" ? sql`e.initial` : sql`e.included`} end)`} and c.display_name ilike ${pattern(p.query)} ${cursor(p, sql`r.created_at`, sql`r.id`)} order by r.created_at desc,r.id desc limit ${p.limit + 1}`,
      );
    },
  };
}
