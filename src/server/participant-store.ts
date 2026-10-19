import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
import type { DirectoryIdentity } from "./community-store.ts";
const cursor = (p: PageInput, at: SQL, id: SQL) =>
  p.after
    ? sql`and (${at},${id})<(${p.after.at}::timestamptz,${p.after.id}::uuid)`
    : sql``;
const pattern = (q: string) => "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
export type ParticipantStore = ReturnType<typeof createParticipantStore>;
export function createParticipantStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url)),
    rows = async (s: SQL) =>
      execute
        ? execute(s)
        : ((await db.execute(s)).rows as Record<string, unknown>[]);
  return {
    summary(user: string, org: string) {
      return rows(
        sql`select p.name,w.earned::text,w.reserved::text,w.spent::text,w.available::text from hub_people p cross join lateral hub_reward_wallet(p.organization_id,p.id) w where p.organization_id=${org}::uuid and p.id=hub_participant_person(${user},${org}::uuid)`,
      );
    },
    points(user: string, org: string, p: PageInput) {
      return rows(
        sql`select e.id,e.amount,e.source,e.original_id is not null as "isAdjustment",e.created_at::text as "createdAt",e.occurred_at::text as "occurredAt",(e.amount+coalesce((select sum(amount) from hub_points_entries where organization_id=e.organization_id and person_id=e.person_id and original_id=e.id),0))::int as "currentAmount" from hub_points_entries e where e.organization_id=${org}::uuid and e.person_id=hub_participant_person(${user},${org}::uuid) ${cursor(p, sql`e.created_at`, sql`e.id`)} order by e.created_at desc,e.id desc limit ${p.limit + 1}`,
      );
    },
    rewards(user: string, org: string, p: PageInput) {
      return rows(
        sql`select r.id,r.name,r.description,r.cost,r.version,r.created_at::text as "createdAt",(r.stock is null or r.stock>(select count(*) from hub_redemptions where organization_id=r.organization_id and reward_id=r.id and status<>'cancelled')) as "inStock",(w.available>=r.cost and (r.stock is null or r.stock>(select count(*) from hub_redemptions where organization_id=r.organization_id and reward_id=r.id and status<>'cancelled'))) as eligible from hub_rewards r cross join lateral hub_reward_wallet(${org}::uuid,hub_participant_person(${user},${org}::uuid)) w where r.organization_id=${org}::uuid and hub_participant_person(${user},${org}::uuid) is not null and not r.archived and r.name ilike ${pattern(p.query)} ${cursor(p, sql`r.created_at`, sql`r.id`)} order by r.created_at desc,r.id desc limit ${p.limit + 1}`,
      );
    },
    redemptions(user: string, org: string, p: PageInput) {
      return rows(
        sql`select id,reward_name as "rewardName",cost,status,created_at::text as "createdAt",fulfilled_at::text as "fulfilledAt",cancelled_at::text as "cancelledAt" from hub_redemptions where organization_id=${org}::uuid and person_id=hub_participant_person(${user},${org}::uuid) and reward_name ilike ${pattern(p.query)} ${cursor(p, sql`created_at`, sql`id`)} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    account(user: string, org: string, person: string) {
      return rows(
        sql`select json_build_object('id',p.id,'name',p.name,'archived',p.archived) as person,(select json_build_object('id',l.id,'email',i.email,'createdAt',l.created_at::text) from hub_participant_links l join hub_participant_invitations i on i.organization_id=l.organization_id and i.id=l.invitation_id where l.organization_id=p.organization_id and l.person_id=p.id and l.revoked_at is null) as link,exists(select 1 from hub_participant_invitations where organization_id=p.organization_id and person_id=p.id and revoked_at is null and accepted_by is null and expires_at>clock_timestamp()) as pending from hub_people p where p.organization_id=${org}::uuid and p.id=${person}::uuid and hub_is_admin(${user},${org}::uuid)`,
      );
    },
    invitations(user: string, org: string, person: string, p: PageInput) {
      return rows(
        sql`select id,email,created_at::text as "createdAt",expires_at::text as "expiresAt",consent_attested_at::text as "consentAttestedAt",revoked_at::text as "revokedAt",accepted_by is not null as accepted from hub_participant_invitations where organization_id=${org}::uuid and person_id=${person}::uuid and hub_is_admin(${user},${org}::uuid) ${cursor(p, sql`created_at`, sql`id`)} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    events(user: string, org: string, person: string, p: PageInput) {
      return rows(
        sql`select e.id,e.action,e.created_at::text as "createdAt",m.display_name as "actorName",case when e.action in ('revoke_link','member_archived') then (select revoke_reason from hub_participant_links where organization_id=e.organization_id and id=e.entity_id) else null end as reason from hub_participant_events e left join hub_memberships m on m.organization_id=e.organization_id and m.user_id=e.actor_id where e.organization_id=${org}::uuid and e.person_id=${person}::uuid and hub_is_admin(${user},${org}::uuid) ${cursor(p, sql`e.created_at`, sql`e.id`)} order by e.created_at desc,e.id desc limit ${p.limit + 1}`,
      );
    },
    invite(
      user: string,
      org: string,
      person: string,
      key: string,
      email: string,
      hash: string,
      consent: boolean,
    ) {
      return rows(
        sql`select hub_invite_participant(${user},${org}::uuid,${person}::uuid,${key}::uuid,${email},${hash},${consent}) as result`,
      );
    },
    revoke(
      user: string,
      org: string,
      person: string,
      id: string,
      kind: string,
      reason: string | null,
    ) {
      return rows(
        sql`select hub_revoke_participant(${user},${org}::uuid,${person}::uuid,${id}::uuid,${kind},${reason}) as result`,
      );
    },
    preview(user: DirectoryIdentity, hash: string) {
      return rows(
        sql`select o.name as "organizationName",p.name as "personName" from hub_participant_invitations i join hub_organizations o on o.id=i.organization_id join hub_people p on p.organization_id=i.organization_id and p.id=i.person_id where i.token_hash=${hash} and i.email=lower(${user.email}) and not p.archived and ((i.accepted_by is null and i.revoked_at is null and i.expires_at>clock_timestamp() and hub_is_admin(i.created_by,i.organization_id)) or (i.accepted_by=${user.id} and exists(select 1 from hub_participant_links where invitation_id=i.id and user_id=${user.id} and revoked_at is null))) limit 1`,
      );
    },
    accept(user: DirectoryIdentity, hash: string) {
      return rows(
        sql`select hub_accept_participant(${user.id},${user.email},${hash}) as result`,
      );
    },
  };
}
