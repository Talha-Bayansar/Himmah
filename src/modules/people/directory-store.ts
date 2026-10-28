import { sql, type SQL } from "drizzle-orm";
import type { Execute } from "./store.ts";
import type { PageInput } from "../../community/contracts.ts";
import type {
  PeopleGroup,
  GroupMember,
  ContactGroup,
  Contact,
  RelationshipType,
  ContactRelationship,
} from "./contracts.ts";
export type CommandResult = {
  id?: string;
  code?: string;
  replayed?: boolean;
  version?: number;
  outcomes?: { id: string; outcome: string }[];
};
export function createDirectoryStore(
  run: Execute,
  access: (actor: string, org: string) => SQL,
) {
  const pattern = (p: PageInput) =>
    "%" + p.query.replace(/[\\%_]/g, "\\$&") + "%";
  const after = (p: PageInput, table: string) =>
    p.after
      ? sql`and (${sql.identifier(table)}.created_at,${sql.identifier(table)}.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)`
      : sql``;
  const groupFields = sql`g.id,g.name,g.description,g.version,g.archived_at::text as "archivedAt",g.created_at::text as "createdAt",(select count(*)::int from himmah.group_memberships m where m.organization_id=g.organization_id and m.group_id=g.id and m.valid_to is null) as "memberCount"`;
  const typeFields = sql`t.id,t.code,t.symmetric,t.category,t.version,t.archived_at::text as "archivedAt",t.created_at::text as "createdAt",v.id as "typeVersionId",v.forward_labels as "forwardLabels",v.inverse_labels as "inverseLabels"`;
  const latestType = sql`join lateral(select * from himmah.relationship_type_versions where organization_id=t.organization_id and type_id=t.id order by revision desc limit 1) v on true`;
  return {
    async groupList(actor: string, org: string, p: PageInput) {
      return (await run(
        sql`select ${groupFields} from himmah.groups g where g.organization_id=${org}::uuid and ${access(actor, org)} and (g.archived_at is not null)=${p.archived} and g.name ilike ${pattern(p)} ${after(p, "g")} order by g.created_at desc,g.id desc limit ${p.limit + 1}`,
      )) as unknown as PeopleGroup[];
    },
    async groupOptions(actor: string, org: string, id: string, p: PageInput) {
      return (await run(
        sql`select ${groupFields},exists(select 1 from himmah.group_memberships m where m.organization_id=g.organization_id and m.group_id=g.id and m.contact_id=${id}::uuid and m.valid_to is null) as assigned from himmah.groups g where g.organization_id=${org}::uuid and g.archived_at is null and ${access(actor, org)} and g.name ilike ${pattern(p)} ${after(p, "g")} order by g.created_at desc,g.id desc limit ${p.limit + 1}`,
      )) as unknown as (PeopleGroup & { assigned: boolean })[];
    },
    async getGroup(actor: string, org: string, id: string) {
      return (
        await run(
          sql`select ${groupFields} from himmah.groups g where g.organization_id=${org}::uuid and g.id=${id}::uuid and ${access(actor, org)}`,
        )
      )[0] as PeopleGroup | undefined;
    },
    async groupMembers(
      actor: string,
      org: string,
      id: string,
      p: PageInput,
      history: boolean,
    ) {
      return (await run(
        sql`select m.id,m.contact_id as "contactId",c.display_name as "displayName",c.version as "contactVersion",(c.archived_at is not null) as "contactArchived",m.version,m.valid_from::text as "validFrom",m.valid_to::text as "validTo",m.end_reason as "endReason",m.created_at::text as "createdAt" from himmah.group_memberships m join himmah.contacts c on c.organization_id=m.organization_id and c.id=m.contact_id where m.organization_id=${org}::uuid and m.group_id=${id}::uuid and ${access(actor, org)} and (${history} or m.valid_to is null) and c.display_name ilike ${pattern(p)} ${after(p, "m")} order by m.created_at desc,m.id desc limit ${p.limit + 1}`,
      )) as unknown as GroupMember[];
    },
    async memberOptions(actor: string, org: string, id: string, p: PageInput) {
      return (await run(
        sql`select c.id,c.display_name as "displayName",c.given_name as "givenName",c.family_name as "familyName",c.version,c.created_at::text as "createdAt",null as "archivedAt",exists(select 1 from himmah.group_memberships m where m.organization_id=c.organization_id and m.contact_id=c.id and m.group_id=${id}::uuid and m.valid_to is null) as assigned from himmah.contacts c where c.organization_id=${org}::uuid and c.archived_at is null and ${access(actor, org)} and c.display_name ilike ${pattern(p)} ${after(p, "c")} order by c.created_at desc,c.id desc limit ${p.limit + 1}`,
      )) as unknown as (Contact & { assigned: boolean })[];
    },
    async contactGroups(
      actor: string,
      org: string,
      id: string,
      p: PageInput,
      history: boolean,
    ) {
      return (await run(
        sql`select m.id,m.group_id as "groupId",g.name,g.version as "groupVersion",(g.archived_at is not null) as "groupArchived",m.version,m.valid_from::text as "validFrom",m.valid_to::text as "validTo",m.created_at::text as "createdAt",m.end_reason as "endReason" from himmah.group_memberships m join himmah.groups g on g.organization_id=m.organization_id and g.id=m.group_id where m.organization_id=${org}::uuid and m.contact_id=${id}::uuid and ${access(actor, org)} and (${history} or m.valid_to is null) and g.name ilike ${pattern(p)} ${after(p, "m")} order by m.created_at desc,m.id desc limit ${p.limit + 1}`,
      )) as unknown as ContactGroup[];
    },
    async relationshipTypes(actor: string, org: string, p: PageInput) {
      return (await run(
        sql`select ${typeFields} from himmah.relationship_types t ${latestType} where t.organization_id=${org}::uuid and ${access(actor, org)} and (t.archived_at is not null)=${p.archived} and (v.forward_labels->>'en' ilike ${pattern(p)} or v.forward_labels->>'nl' ilike ${pattern(p)} or v.forward_labels->>'tr' ilike ${pattern(p)} or v.inverse_labels->>'en' ilike ${pattern(p)} or v.inverse_labels->>'nl' ilike ${pattern(p)} or v.inverse_labels->>'tr' ilike ${pattern(p)}) ${after(p, "t")} order by t.created_at desc,t.id desc limit ${p.limit + 1}`,
      )) as unknown as RelationshipType[];
    },
    async getRelationshipType(actor: string, org: string, id: string) {
      return (
        await run(
          sql`select ${typeFields} from himmah.relationship_types t ${latestType} where t.organization_id=${org}::uuid and t.id=${id}::uuid and ${access(actor, org)}`,
        )
      )[0] as RelationshipType | undefined;
    },
    async relationships(
      actor: string,
      org: string,
      id: string,
      p: PageInput,
      history: boolean,
    ) {
      return (await run(
        sql`select r.id,c.id as "contactId",c.display_name as "displayName",(c.archived_at is not null) as "contactArchived",(r.source_contact_id=${id}::uuid) as "subjectIsSource",r.type_id as "typeId",r.type_version_id as "typeVersionId",v.forward_labels as "forwardLabels",v.inverse_labels as "inverseLabels",t.symmetric,r.version,r.valid_from::text as "validFrom",r.valid_to::text as "validTo",r.end_reason as "endReason",r.created_at::text as "createdAt" from himmah.contact_relationships r join himmah.contacts c on c.organization_id=r.organization_id and c.id=case when r.source_contact_id=${id}::uuid then r.target_contact_id else r.source_contact_id end join himmah.relationship_type_versions v on v.organization_id=r.organization_id and v.type_id=r.type_id and v.id=r.type_version_id join himmah.relationship_types t on t.organization_id=r.organization_id and t.id=r.type_id where r.organization_id=${org}::uuid and ${id}::uuid in (r.source_contact_id,r.target_contact_id) and ${access(actor, org)} and (${history} or r.valid_to is null) and c.display_name ilike ${pattern(p)} ${after(p, "r")} order by r.created_at desc,r.id desc limit ${p.limit + 1}`,
      )) as unknown as ContactRelationship[];
    },
    async groupHistory(actor: string, org: string, id: string, p: PageInput) {
      return (await run(
        sql`select e.id,e.action,e.reason,e.actor_id as "actorId",e.entity_version as version,e.occurred_at::text as "createdAt" from himmah.group_events e where e.organization_id=${org}::uuid and e.group_id=${id}::uuid and ${access(actor, org)} ${p.after ? sql`and (e.occurred_at,e.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by e.occurred_at desc,e.id desc limit ${p.limit + 1}`,
      )) as {
        id: string;
        createdAt: string;
        action: string;
        reason: string | null;
        actorId: string;
        version: number;
      }[];
    },
    async groupCommand(
      actor: string,
      org: string,
      op: string,
      key: string,
      payload: Record<string, unknown>,
    ) {
      return (
        await run(
          sql`select himmah.group_command(${actor},${org}::uuid,${op},${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
        )
      )[0]!.result as CommandResult;
    },
    async typeCommand(
      actor: string,
      org: string,
      op: string,
      key: string,
      payload: Record<string, unknown>,
    ) {
      return (
        await run(
          sql`select himmah.relationship_type_command(${actor},${org}::uuid,${op},${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
        )
      )[0]!.result as CommandResult;
    },
    async relationshipCommand(
      actor: string,
      org: string,
      op: string,
      key: string,
      payload: Record<string, unknown>,
    ) {
      return (
        await run(
          sql`select himmah.relationship_command(${actor},${org}::uuid,${op},${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
        )
      )[0]!.result as CommandResult;
    },
  };
}
