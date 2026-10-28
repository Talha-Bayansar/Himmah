import { createCommunicationStore } from "./communication-store.ts";
import { createDirectoryStore } from "./directory-store.ts";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../../community/contracts.ts";
import type { Contact, ContactMethod } from "./contracts.ts";
export type Execute = (query: SQL) => Promise<Record<string, unknown>[]>;
export function createPeopleStore(url: string, execute?: Execute) {
  const db = execute ? null : drizzle(neon(url));
  const run: Execute =
    execute ??
    (async (query) =>
      (await db!.execute(query)).rows as Record<string, unknown>[]);
  const access = (actor: string, org: string) =>
    sql`exists(select 1 from himmah.staff_memberships where organization_id=${org}::uuid and user_id=${actor} and active and role in ('owner','admin'))`;
  const contactFields = sql`id,display_name as "displayName",given_name as "givenName",family_name as "familyName",version,created_at::text as "createdAt",archived_at::text as "archivedAt"`;
  const after = (p: PageInput, column: SQL = sql`created_at`) =>
    p.after
      ? sql`and (${column},id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)`
      : sql``;
  return {
    ...createDirectoryStore(run, access),
    ...createCommunicationStore(run, access),
    async context(actor: string, org: string) {
      return (
        (
          await run(
            sql`select id,name from himmah.organizations where id=${org}::uuid and ${access(actor, org)}`,
          )
        )[0] ?? null
      );
    },
    async list(actor: string, org: string, p: PageInput) {
      const pattern = "%" + p.query.replace(/[\\%_]/g, "\\$&") + "%";
      return (await run(
        sql`select ${contactFields} from himmah.contacts where organization_id=${org}::uuid and ${access(actor, org)} and (archived_at is not null)=${p.archived} and (display_name ilike ${pattern} or given_name ilike ${pattern} or family_name ilike ${pattern}) ${after(p)} order by created_at desc,id desc limit ${p.limit + 1}`,
      )) as unknown as Contact[];
    },
    async get(actor: string, org: string, id: string) {
      return (
        await run(
          sql`select ${contactFields},(select count(*)::int from himmah.group_memberships m where m.organization_id=${org}::uuid and m.contact_id=${id}::uuid and m.valid_to is null) as "activeGroupCount",(select count(distinct a.subject_contact_id)::int from himmah.communication_assignments a where a.organization_id=${org}::uuid and a.responsible_contact_id=${id}::uuid and a.valid_to is null) as "communicationDependentCount" from himmah.contacts where organization_id=${org}::uuid and id=${id}::uuid and ${access(actor, org)}`,
        )
      )[0] as Contact | undefined;
    },
    async methods(actor: string, org: string, id: string, p: PageInput) {
      return (await run(
        sql`select id,kind,value,preferred,created_at::text as "createdAt" from himmah.contact_methods where organization_id=${org}::uuid and contact_id=${id}::uuid and ended_at is null and value ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} and ${access(actor, org)} ${after(p)} order by created_at desc,id desc limit ${p.limit + 1}`,
      )) as unknown as ContactMethod[];
    },
    async history(actor: string, org: string, id: string, p: PageInput) {
      return run(
        sql`select id,action,entity_version as version,changed_fields as "changedFields",occurred_at::text as "createdAt" from himmah.people_audit_events where organization_id=${org}::uuid and contact_id=${id}::uuid and ${access(actor, org)} ${after(p, sql`occurred_at`)} order by occurred_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    async collectionCount(
      actor: string,
      org: string,
      id: string,
      kind: "methods" | "memberships" | "relationships" | "history",
      p: PageInput,
      history = false,
    ) {
      const pattern = "%" + p.query.replace(/[\\%_]/g, "\\$&") + "%";
      let query: SQL;
      if (kind === "methods")
        query = sql`select count(*)::int total from himmah.contact_methods where organization_id=${org}::uuid and contact_id=${id}::uuid and ended_at is null and value ilike ${pattern} and ${access(actor, org)}`;
      else if (kind === "memberships")
        query = sql`select count(*)::int total from himmah.group_memberships m join himmah.groups g on g.organization_id=m.organization_id and g.id=m.group_id where m.organization_id=${org}::uuid and m.contact_id=${id}::uuid and (${history} or m.valid_to is null) and g.name ilike ${pattern} and ${access(actor, org)}`;
      else if (kind === "relationships")
        query = sql`select count(*)::int total from himmah.contact_relationships r join himmah.contacts c on c.organization_id=r.organization_id and c.id=case when r.source_contact_id=${id}::uuid then r.target_contact_id else r.source_contact_id end where r.organization_id=${org}::uuid and ${id}::uuid in(r.source_contact_id,r.target_contact_id) and (${history} or r.valid_to is null) and c.display_name ilike ${pattern} and ${access(actor, org)}`;
      else
        query = sql`select count(*)::int total from himmah.people_audit_events where organization_id=${org}::uuid and contact_id=${id}::uuid and ${access(actor, org)}`;
      return Number((await run(query))[0]!.total);
    },
    async command(
      actor: string,
      org: string,
      operation: string,
      key: string,
      payload: Record<string, unknown>,
    ) {
      return (
        await run(
          sql`select himmah.contact_command(${actor},${org}::uuid,${operation},${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
        )
      )[0]!.result as { id?: string; code?: string; replayed?: boolean };
    },
  };
}
export type PeopleStore = ReturnType<typeof createPeopleStore>;
