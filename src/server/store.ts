import type { PageInput } from "../community/contracts.ts";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import type {
  Organization,
  OrganizationInput,
} from "../organization/contracts.ts";
export interface OrganizationStore {
  list(userId: string, input?: PageInput): Promise<Organization[]>;
  create(userId: string, input: OrganizationInput): Promise<Organization>;
  get(userId: string, id: string): Promise<Organization | null>;
}
export function createStore(url: string): OrganizationStore {
  const db = drizzle(neon(url));
  const projection = sql`o.id, o.name, o.slug, o.timezone, m.role, o.created_at::text as "createdAt"`;
  return {
    async list(userId, input) {
      const rows = await db.execute(
        sql`select ${projection} from hub_organizations o inner join hub_memberships m on m.organization_id=o.id where m.user_id=${userId} ${input?.query ? sql`and o.name ilike ${"%" + input.query.replace(/[\\%_]/g, "\\$&") + "%"}` : sql``} ${input?.after ? sql`and (o.created_at,o.id) < (${input.after.at}::timestamptz,${input.after.id}::uuid)` : sql``} order by o.created_at desc,o.id desc limit ${(input?.limit ?? 25) + 1}`,
      );
      return rows.rows as unknown as Organization[];
    },
    async get(userId, id) {
      const rows = await db.execute(
        sql`select ${projection} from hub_organizations o inner join hub_memberships m on m.organization_id=o.id where m.user_id=${userId} and o.id=${id}::uuid limit 1`,
      );
      return (rows.rows[0] as unknown as Organization | undefined) ?? null;
    },
    async create(userId, input) {
      // Organization and owner membership are created in one atomic statement.
      // The owner is derived from the verified session, never from request data.
      const rows = await db.execute(createOrganizationStatement(userId, input));
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
