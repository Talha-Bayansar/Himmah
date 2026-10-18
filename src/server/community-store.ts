import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput, StaffRole } from "../community/contracts.ts";
export type DirectoryIdentity = { id: string; name: string; email: string };
export type CommunityStore = ReturnType<typeof createCommunityStore>;
const table = (kind: "people" | "groups") =>
  sql.raw(kind === "people" ? "hub_people" : "hub_groups");
const actor = (user: string, org: string, owner = false) =>
  sql`actor as (select role from hub_memberships where organization_id=${org}::uuid and user_id=${user} and role in (${owner ? sql`'owner'` : sql`'owner','admin'`}) for update)`;
const audit = (org: string, user: string, action: string) =>
  sql`logged as (insert into hub_directory_audit (organization_id,actor_id,action,entity_id) select ${org}::uuid,${user},${action},id::text from changed returning id)`;
const projection = sql`id,name,archived,version,created_at::text as "createdAt"`;
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
    async person(user: string, org: string, id: string) {
      return rows(
        sql`with ${actor(user, org)} select ${projection} from hub_people where organization_id=${org}::uuid and id=${id}::uuid and not archived and exists(select 1 from actor) limit 1`,
      );
    },
    async groupOptions(
      user: string,
      org: string,
      person: string,
      p: PageInput,
    ) {
      return rows(
        sql`with ${actor(user, org)} select ${projection}, exists(select 1 from hub_group_people gp where gp.organization_id=${org}::uuid and gp.person_id=${person}::uuid and gp.group_id=hub_groups.id) as assigned from hub_groups where organization_id=${org}::uuid and exists(select 1 from actor) and exists(select 1 from hub_people hp where hp.organization_id=${org}::uuid and hp.id=${person}::uuid and not hp.archived) and not archived and name ilike ${pattern(p.query)} ${cursor(p)} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    async memberOptions(
      user: string,
      org: string,
      group: string,
      p: PageInput,
    ) {
      return rows(
        sql`with ${actor(user, org)} select ${projection}, exists(select 1 from hub_group_people gp where gp.organization_id=${org}::uuid and gp.group_id=${group}::uuid and gp.person_id=hub_people.id) as assigned from hub_people where organization_id=${org}::uuid and not archived and exists(select 1 from actor) and exists(select 1 from hub_groups where organization_id=${org}::uuid and id=${group}::uuid and not archived) and name ilike ${pattern(p.query)} ${cursor(p)} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    async addMembers(
      user: string,
      org: string,
      group: string,
      people: string[],
    ) {
      // One statement: either every requested member is eligible or nothing changes.
      // Stable entity lock order and uniqueness make retries safe without duplicate audit events.
      const ids = sql.join(
        people.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      return rows(
        sql`with ${actor(user, org)}, eligible_group as (select id from hub_groups where organization_id=${org}::uuid and id=${group}::uuid and not archived for update), eligible_people as (select id from hub_people where organization_id=${org}::uuid and id in (${ids}) and not archived order by id for update), permitted as (select 1 where exists(select 1 from actor) and exists(select 1 from eligible_group) and (select count(*) from eligible_people)=${people.length}), changed as (insert into hub_group_people (organization_id,group_id,person_id) select ${org}::uuid,${group}::uuid,id from eligible_people where exists(select 1 from permitted) on conflict do nothing returning person_id as id), ${audit(org, user, "group.add")} select id from eligible_people where exists(select 1 from permitted)`,
      );
    },
    async group(user: string, org: string, id: string) {
      return rows(
        sql`with ${actor(user, org)} select ${projection} from hub_groups where organization_id=${org}::uuid and id=${id}::uuid and not archived and exists(select 1 from actor) limit 1`,
      );
    },
    async list(
      user: string,
      org: string,
      kind: "people" | "groups",
      p: PageInput,
    ) {
      return rows(
        sql`with ${actor(user, org)} select ${projection} from ${table(kind)} where organization_id=${org}::uuid and exists(select 1 from actor) and archived=${p.archived} and name ilike ${pattern(p.query)} ${cursor(p)} ${kind === "people" && p.groupId ? sql`and exists(select 1 from hub_group_people gp join hub_groups g on g.organization_id=gp.organization_id and g.id=gp.group_id where gp.organization_id=${org}::uuid and gp.person_id=hub_people.id and gp.group_id=${p.groupId}::uuid and not g.archived)` : sql``} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    async create(
      user: string,
      org: string,
      kind: "people" | "groups",
      name: string,
      key: string,
    ) {
      return rows(sql`with ${actor(user, org)}, changed as (
    insert into ${table(kind)} (organization_id,name,created_by,creation_key ${kind === "people" ? sql`,consent_recorded_by` : sql``})
    select ${org}::uuid,${name},${user},${key}::uuid ${kind === "people" ? sql`,${user}` : sql``} from actor
    on conflict (organization_id,creation_key) do update set creation_key=excluded.creation_key returning *, (xmax=0) as inserted
   ), logged as (insert into hub_directory_audit (organization_id,actor_id,action,entity_id) select ${org}::uuid,${user},${kind + ".create"},id::text from changed where inserted returning id)
   select ${projection} from changed`);
    },
    async update(
      user: string,
      org: string,
      kind: "people" | "groups",
      id: string,
      version: number,
      name: string | null,
      archived: boolean | null,
    ) {
      return rows(
        sql`with ${actor(user, org)}, changed as (update ${table(kind)} set name=coalesce(${name},name),archived=coalesce(${archived},archived),version=version+1 where organization_id=${org}::uuid and id=${id}::uuid and version=${version} and exists(select 1 from actor) returning *), ${audit(org, user, kind + ".update")} select ${projection} from changed`,
      );
    },
    async setGroup(
      user: string,
      org: string,
      person: string,
      group: string,
      add: boolean,
    ) {
      // Lock both entities so an archive and a group assignment cannot race.
      return rows(sql`with ${actor(user, org)}, eligible_person as (select id from hub_people where organization_id=${org}::uuid and id=${person}::uuid and not archived for update), eligible_group as (select id from hub_groups where organization_id=${org}::uuid and id=${group}::uuid and not archived for update), changed as (
    ${add ? sql`insert into hub_group_people (organization_id,person_id,group_id) select ${org}::uuid,${person}::uuid,${group}::uuid where exists(select 1 from actor) and exists(select 1 from eligible_person) and exists(select 1 from eligible_group) on conflict do nothing returning person_id as id` : sql`delete from hub_group_people where organization_id=${org}::uuid and person_id=${person}::uuid and group_id=${group}::uuid and exists(select 1 from actor) and exists(select 1 from eligible_person) and exists(select 1 from eligible_group) returning person_id as id`}
   ), ${audit(org, user, add ? "group.add" : "group.remove")}
   select id from eligible_person where exists(select 1 from actor) and exists(select 1 from eligible_group)`);
    },
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
        sql`with eligible as (select i.* from hub_invitations i join hub_memberships creator on creator.organization_id=i.organization_id and creator.user_id=i.created_by where i.token_hash=${hash} and lower(i.email)=lower(${user.email}) and not i.revoked and i.expires_at>now() and i.accepted_by is null and (creator.role='owner' or (creator.role='admin' and i.role='volunteer')) for update of i,creator), joined as (insert into hub_memberships (organization_id,user_id,role,display_name) select organization_id,${user.id},role,${user.name} from eligible on conflict (organization_id,user_id) do nothing returning organization_id), consumed as (update hub_invitations set accepted_by=${user.id},accepted_at=now() where id in (select id from eligible) returning organization_id,id), logged as (insert into hub_directory_audit (organization_id,actor_id,action,entity_id) select organization_id,${user.id},'invite.accept',id::text from consumed returning id) select organization_id as id from consumed union all select i.organization_id as id from hub_invitations i join hub_memberships m on m.organization_id=i.organization_id and m.user_id=${user.id} where i.token_hash=${hash} and i.accepted_by=${user.id} and not exists(select 1 from consumed) limit 1`,
      );
    },
  };
}
