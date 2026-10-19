import type { PageInput } from "../community/contracts.ts";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type {
  Organization,
  OrganizationInput,
} from "../organization/contracts.ts";
export interface OrganizationStore {
  list(userId: string, input?: PageInput): Promise<Organization[]>;
  create(userId: string, input: OrganizationInput): Promise<Organization>;
  get(userId: string, id: string): Promise<Organization | null>;
}
export function createStore(
  url: string,
  execute?: (statement: SQL) => Promise<Record<string, unknown>[]>,
): OrganizationStore {
  const db = drizzle(neon(url));
  const run = async (statement: SQL) => ({
    rows: execute
      ? await execute(statement)
      : (await db.execute(statement)).rows,
  });
  const access = (user: string) =>
    sql`access as (select organization_id,role from hub_memberships where user_id=${user} union all select l.organization_id,'participant'::text as role from hub_participant_links l join hub_people p on p.organization_id=l.organization_id and p.id=l.person_id where l.user_id=${user} and l.revoked_at is null and not p.archived and not exists(select 1 from hub_memberships where organization_id=l.organization_id and user_id=${user}))`;
  const projection = sql`o.id, o.name, o.slug, o.timezone, m.role, o.created_at::text as "createdAt"`;
  return {
    async list(userId, input) {
      const rows = await run(
        sql`with ${access(userId)} select ${projection} from hub_organizations o inner join access m on m.organization_id=o.id where true ${input?.query ? sql`and o.name ilike ${"%" + input.query.replace(/[\\%_]/g, "\\$&") + "%"}` : sql``} ${input?.after ? sql`and (o.created_at,o.id) < (${input.after.at}::timestamptz,${input.after.id}::uuid)` : sql``} order by o.created_at desc,o.id desc limit ${(input?.limit ?? 25) + 1}`,
      );
      return rows.rows as unknown as Organization[];
    },
    async get(userId, id) {
      const rows = await run(
        sql`with ${access(userId)} select ${projection} from hub_organizations o inner join access m on m.organization_id=o.id where true and o.id=${id}::uuid limit 1`,
      );
      return (rows.rows[0] as unknown as Organization | undefined) ?? null;
    },
    async create(userId, input) {
      // Organization and owner membership are created in one atomic statement.
      // The owner is derived from the verified session, never from request data.
      const rows = await run(createOrganizationStatement(userId, input));
      const row = rows.rows[0] as unknown as Organization | undefined;
      if (!row) throw Error("Organization could not be created.");
      return row;
    },
  };
}

/** Parameterized atomic statement, also exercised against the development database. */
export function createOrganizationStatement(
  userId: string,
  input: OrganizationInput,
) {
  return sql`
    with organization as (
     insert into hub_organizations (name,slug,timezone,created_by,creation_key)
     values (${input.name},${input.slug},${input.timezone},${userId},${input.creationKey}::uuid)
     on conflict (created_by,creation_key) do update set created_by=hub_organizations.created_by
     returning *
    ), membership as (
     insert into hub_memberships (organization_id,user_id,role)
     select id, ${userId}, 'owner' from organization
     on conflict (organization_id,user_id) do update set user_id=hub_memberships.user_id
     returning organization_id,role
    ) select o.id,o.name,o.slug,o.timezone,m.role,o.created_at::text as "createdAt"
      from organization o join membership m on m.organization_id=o.id
   `;
}
