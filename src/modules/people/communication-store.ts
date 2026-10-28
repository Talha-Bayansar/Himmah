import { sql, type SQL } from "drizzle-orm";
import type { Execute } from "./store.ts";
import type { PageInput } from "../../community/contracts.ts";
import type { CommunicationAssignment, ContactRouting } from "./contracts.ts";
import type { CommandResult } from "./directory-store.ts";
export function createCommunicationStore(
  run: Execute,
  access: (actor: string, org: string) => SQL,
) {
  const methods = sql`left join lateral(select value from himmah.contact_methods m where m.organization_id=c.organization_id and m.contact_id=c.id and m.ended_at is null and m.kind='phone' order by m.preferred desc,m.created_at desc,m.id desc limit 1) phone on true left join lateral(select value from himmah.contact_methods m where m.organization_id=c.organization_id and m.contact_id=c.id and m.ended_at is null and m.kind='email' order by m.preferred desc,m.created_at desc,m.id desc limit 1) email on true`;
  return {
    async communicationAssignments(
      actor: string,
      org: string,
      id: string,
      p: PageInput,
      history: boolean,
    ) {
      const where = sql`a.organization_id=${org}::uuid and a.subject_contact_id=${id}::uuid and (${history} or a.valid_to is null) and c.display_name ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} and ${access(actor, org)}`;
      const rows = await run(
        sql`select a.id,a.responsible_contact_id as "responsibleContactId",c.display_name as "displayName",(c.archived_at is not null) as "contactArchived",a.purpose,a.priority,a.channel,a.version,a.valid_to::text as "validTo",a.end_reason as "endReason",a.created_at::text as "createdAt",case when a.channel in('phone','any') and c.archived_at is null then phone.value end as phone,case when a.channel in('email','any') and c.archived_at is null then email.value end as email from himmah.communication_assignments a join himmah.contacts c on c.organization_id=a.organization_id and c.id=a.responsible_contact_id ${methods} where ${where} ${p.after ? sql`and (a.created_at,a.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by a.created_at desc,a.id desc limit ${p.limit + 1}`,
      );
      const total = Number(
        (
          await run(
            sql`select count(*)::int total from himmah.communication_assignments a join himmah.contacts c on c.organization_id=a.organization_id and c.id=a.responsible_contact_id where ${where}`,
          )
        )[0]!.total,
      );
      return { rows: rows as unknown as CommunicationAssignment[], total };
    },
    async contactRouting(actor: string, org: string, id: string) {
      // Rank the entire authorized set before bounding the preview. Missing channels never block a later usable candidate.
      const result =
        await run(sql`with subject as(select c.*,p.routine_direct_allowed,p.emergency_direct_allowed from himmah.contacts c join himmah.contact_communication_preferences p on p.organization_id=c.organization_id and p.contact_id=c.id where c.organization_id=${org}::uuid and c.id=${id}::uuid and ${access(actor, org)}), candidates as(
    select a.id,a.purpose,c.id as contact_id,c.display_name,a.priority,false as direct,case when a.channel in('phone','any') then phone.value end as phone,case when a.channel in('email','any') then email.value end as email,a.priority as rank from himmah.communication_assignments a join subject s on s.organization_id=a.organization_id and s.id=a.subject_contact_id join himmah.contacts c on c.organization_id=a.organization_id and c.id=a.responsible_contact_id ${methods} where a.valid_to is null and c.archived_at is null and s.archived_at is null
    union all select c.id,purpose,c.id,c.display_name,0,true,phone.value,email.value,case when purpose='routine' then 0 else 100 end from subject c ${methods} cross join(values('routine'),('emergency')) purpose(purpose) where c.archived_at is null and case when purpose='routine' then c.routine_direct_allowed else c.emergency_direct_allowed end
   ), scored as(select *,min(rank) filter(where phone is not null or email is not null) over(partition by purpose) best from candidates), summaries as(select purpose,count(*) filter(where phone is not null or email is not null)::int total,count(*) filter(where phone is null and email is null)::int missing from scored group by purpose)
   select jsonb_build_object('routineDirectAllowed',s.routine_direct_allowed,'emergencyDirectAllowed',s.emergency_direct_allowed) as preferences,
   (select jsonb_build_object('total',coalesce((select total from summaries where purpose='routine'),0),'missing',coalesce((select missing from summaries where purpose='routine'),0),'candidates',coalesce((select jsonb_agg(x.candidate order by x.contact_id,x.id) from(select id,contact_id,jsonb_build_object('contactId',contact_id,'displayName',display_name,'priority',priority,'direct',direct,'phone',phone,'email',email) candidate from scored where purpose='routine' and rank=best and (phone is not null or email is not null) order by contact_id,id limit 3)x),'[]'::jsonb),'alternatives',(select count(*)::int from scored where purpose='routine' and rank=best and (phone is not null or email is not null)))) routine,
   (select jsonb_build_object('total',coalesce((select total from summaries where purpose='emergency'),0),'missing',coalesce((select missing from summaries where purpose='emergency'),0),'candidates',coalesce((select jsonb_agg(x.candidate order by x.contact_id,x.id) from(select id,contact_id,jsonb_build_object('contactId',contact_id,'displayName',display_name,'priority',priority,'direct',direct,'phone',phone,'email',email) candidate from scored where purpose='emergency' and rank=best and (phone is not null or email is not null) order by contact_id,id limit 3)x),'[]'::jsonb),'alternatives',(select count(*)::int from scored where purpose='emergency' and rank=best and (phone is not null or email is not null)))) emergency from subject s`);
      return result[0] as unknown as ContactRouting | undefined;
    },
    async communicationCommand(
      actor: string,
      org: string,
      op: string,
      key: string,
      payload: Record<string, unknown>,
    ) {
      return (
        await run(
          sql`select himmah.communication_command(${actor},${org}::uuid,${op},${key}::uuid,${JSON.stringify(payload)}::jsonb) result`,
        )
      )[0]!.result as CommandResult;
    },
  };
}
