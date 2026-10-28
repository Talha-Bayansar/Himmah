import { neon } from "@neondatabase/serverless";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { PageInput, StaffRole } from "../community/contracts.ts";
export type DirectoryIdentity = { id: string; name: string; email: string };
export type CommunityStore = ReturnType<typeof createCommunityStore>;
const actor = (
  user: string,
  org: string,
  owner = false,
  lockOrganization = false,
) =>
  lockOrganization
    ? sql`organization_lock as materialized (select id from hub_organizations where id=${org}::uuid for no key update), actor as (select m.role from hub_memberships m join organization_lock l on l.id=m.organization_id where m.user_id=${user} and m.role in (${owner ? sql`'owner'` : sql`'owner','admin'`}) for update of m)`
    : sql`actor as (select role from hub_memberships where organization_id=${org}::uuid and user_id=${user} and role in (${owner ? sql`'owner'` : sql`'owner','admin'`}) for update)`;
const audit = (org: string, user: string, action: string) =>
  sql`logged as (insert into hub_directory_audit (organization_id,actor_id,action,entity_id) select ${org}::uuid,${user},${action},id::text from changed returning id)`;
function cursor(p: PageInput, idType = "uuid") {
  return p.after
    ? sql`and (created_at,${idType === "uuid" ? sql`id` : sql`user_id`}) < (${p.after.at}::timestamptz,${p.after.id}${sql.raw("::" + idType)})`
    : sql``;
}
const pattern = (query: string) => `%${query.replace(/[\\%_]/g, "\\$&")}%`;
export function createCommunityStore(
  url: string,
  execute?: (statement: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  async function rows(statement: SQL) {
    if (execute) return execute(statement);
    return (await db.execute(statement)).rows as Record<string, unknown>[];
  }
  return {
    async staff(user: string, org: string, p: PageInput) {
      return rows(
        sql`with ${actor(user, org)} select user_id as id,display_name as name,role,created_at::text as "createdAt" from hub_memberships where organization_id=${org}::uuid and exists(select 1 from actor) and coalesce(display_name,role) ilike ${pattern(p.query)} ${cursor(p, "text")} order by created_at desc,user_id desc limit ${p.limit + 1}`,
      );
    },
    async changeStaff(
      user: string,
      org: string,
      target: string,
      previous: StaffRole,
      next: "admin" | "volunteer" | null,
    ) {
      if (next === null) {
        return rows(
          sql`with ${actor(user, org)}, changed as (delete from hub_memberships where organization_id=${org}::uuid and user_id=${target} and user_id<>${user} and role=${previous} and role<>'owner' and exists(select 1 from actor where role='owner' or hub_memberships.role='volunteer') returning user_id as id), ${audit(org, user, "staff.remove")} select id from changed`,
        );
      }
      return rows(
        sql`with ${actor(user, org, true)}, changed as (update hub_memberships set role=${next} where organization_id=${org}::uuid and user_id=${target} and user_id<>${user} and role=${previous} and role<>'owner' and exists(select 1 from actor) returning user_id as id), ${audit(org, user, "staff.role")} select id from changed`,
      );
    },
    async invites(user: string, org: string, p: PageInput) {
      return rows(
        sql`with ${actor(user, org)} select id,email,role,expires_at::text as "expiresAt",revoked,(accepted_by is not null) as accepted,created_at::text as "createdAt" from hub_invitations where organization_id=${org}::uuid and exists(select 1 from actor) and email ilike ${pattern(p.query)} ${cursor(p)} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    async invite(
      user: string,
      org: string,
      email: string,
      role: "admin" | "volunteer",
      key: string,
      hash: string,
    ) {
      return rows(
        sql`with ${actor(user, org, role === "admin")}, changed as (insert into hub_invitations (organization_id,email,role,created_by,creation_key,token_hash,expires_at) select ${org}::uuid,${email},${role},${user},${key}::uuid,${hash},now()+interval '7 days' from actor on conflict (organization_id,creation_key) do update set creation_key=excluded.creation_key returning *, (xmax=0) as inserted), logged as (insert into hub_directory_audit (organization_id,actor_id,action,entity_id) select ${org}::uuid,${user},'invite.create',id::text from changed where inserted returning id) select id from changed`,
      );
    },
    async revoke(user: string, org: string, id: string) {
      return rows(
        sql`with ${actor(user, org)}, changed as (update hub_invitations set revoked=true where organization_id=${org}::uuid and id=${id}::uuid and accepted_by is null and not revoked and exists(select 1 from actor where role='owner' or hub_invitations.role='volunteer') returning id), ${audit(org, user, "invite.revoke")} select id from changed`,
      );
    },
    async preview(user: DirectoryIdentity, hash: string) {
      return rows(
        sql`select o.name,coalesce(member.role,i.role) as role from hub_invitations i join hub_organizations o on o.id=i.organization_id left join hub_memberships member on member.organization_id=i.organization_id and member.user_id=${user.id} join hub_memberships creator on creator.organization_id=i.organization_id and creator.user_id=i.created_by where i.token_hash=${hash} and lower(i.email)=lower(${user.email}) and not i.revoked and i.expires_at>now() and (i.accepted_by is null or i.accepted_by=${user.id}) and (creator.role='owner' or (creator.role='admin' and i.role='volunteer')) limit 1`,
      );
    },
    async accept(user: DirectoryIdentity, hash: string) {
      return rows(
        sql`with organization_lock as materialized (select o.id from hub_organizations o join hub_invitations i on i.organization_id=o.id where i.token_hash=${hash} and lower(i.email)=lower(${user.email}) for no key update of o), eligible as (select i.* from hub_invitations i join organization_lock l on l.id=i.organization_id join hub_memberships creator on creator.organization_id=i.organization_id and creator.user_id=i.created_by where i.token_hash=${hash} and lower(i.email)=lower(${user.email}) and not i.revoked and i.expires_at>now() and i.accepted_by is null and (creator.role='owner' or (creator.role='admin' and i.role='volunteer')) for update of i,creator), joined as (insert into hub_memberships (organization_id,user_id,role,display_name) select organization_id,${user.id},role,${user.name} from eligible on conflict (organization_id,user_id) do nothing returning organization_id), consumed as (update hub_invitations set accepted_by=${user.id},accepted_at=now() where id in (select id from eligible) returning organization_id,id), logged as (insert into hub_directory_audit (organization_id,actor_id,action,entity_id) select organization_id,${user.id},'invite.accept',id::text from consumed returning id) select organization_id as id from consumed union all select i.organization_id as id from hub_invitations i join hub_memberships m on m.organization_id=i.organization_id and m.user_id=${user.id} where i.token_hash=${hash} and i.accepted_by=${user.id} and not exists(select 1 from consumed) limit 1`,
      );
    },
  };
}
