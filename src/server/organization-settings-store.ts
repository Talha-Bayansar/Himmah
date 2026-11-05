import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type {
  OrganizationSettings,
  SettingsInput,
} from "../organization/settings-contracts.ts";
export function createOrganizationSettingsStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = execute ? null : drizzle(neon(url));
  const run = execute ?? (async (s: SQL) => (await db!.execute(s)).rows);
  return {
    async read(actor: string, org: string) {
      return (
        await run(
          sql`select o.name,o.timezone,coalesce(s.description,'') description,coalesce(s.email,'') email,coalesce(s.phone,'') phone,s.default_language as "defaultLanguage",coalesce(s.quiet_enabled,true) as "quietEnabled",coalesce(s.quiet_start,1320) as "quietStart",coalesce(s.quiet_end,480) as "quietEnd",coalesce(s.version,0) version from hub_organizations o join hub_memberships m on m.organization_id=o.id and m.user_id=${actor} and m.role in ('owner','admin') left join hub_organization_settings s on s.organization_id=o.id where o.id=${org}::uuid`,
        )
      )[0] as OrganizationSettings | undefined;
    },
    async save(actor: string, org: string, body: SettingsInput) {
      const { key, ...payload } = body;
      return (
        await run(
          sql`select hub_save_organization_settings(${actor},${org}::uuid,${key}::uuid,${JSON.stringify(payload)}::jsonb) result`,
        )
      )[0]?.result as {
        id?: string;
        version?: number;
        code?: string;
        replayed?: boolean;
      };
    },
  };
}
export type OrganizationSettingsStore = ReturnType<
  typeof createOrganizationSettingsStore
>;
