import { neon } from "@neondatabase/serverless";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { PageInput } from "../community/contracts.ts";
export type AccessStore = ReturnType<typeof createAccessStore>;
const page = (p: PageInput, at: SQL, id: SQL, idType = "uuid") =>
  p.after
    ? sql`and (${at},${id})<(${p.after.at}::timestamptz,${p.after.id}${sql.raw("::" + idType)})`
    : sql``;
const pattern = (q: string) => "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
const projection = sql`exists(select 1 from hub_active_access(v.user_id,v.organization_id) active where active.id=v.id) as effective,v.id,v.user_id as "userId",coalesce(m.display_name,v.staff_name) as "staffName",v.scope_name as "scopeName",v.group_id as "groupId",v.activity_id as "activityId",v.can_attend as "canAttend",v.version,v.created_at::text as "createdAt",v.revoked_at::text as "revokedAt",v.revoke_reason as "revokeReason"`;
export function createAccessStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url)),
    rows = async (s: SQL) =>
      execute
        ? execute(s)
        : ((await db.execute(s)).rows as Record<string, unknown>[]);
  return {
    me(user: string, org: string) {
      return rows(
        sql`select coalesce(bool_or(can_attend),false) as "canAttend" from hub_active_access(${user},${org}::uuid)`,
      );
    },
    list(user: string, org: string, p: PageInput) {
      return rows(
        sql`select ${projection} from hub_volunteer_assignments v left join hub_memberships m on m.organization_id=v.organization_id and m.user_id=v.user_id where v.organization_id=${org}::uuid and hub_is_admin(${user},${org}::uuid) and (v.revoked_at is not null)=${p.archived} and (v.scope_name ilike ${pattern(p.query)} or coalesce(m.display_name,v.staff_name) ilike ${pattern(p.query)}) ${page(p, sql`v.created_at`, sql`v.id`)} order by v.created_at desc,v.id desc limit ${p.limit + 1}`,
      );
    },
    get(user: string, org: string, id: string) {
      return rows(
        sql`select ${projection} from hub_volunteer_assignments v left join hub_memberships m on m.organization_id=v.organization_id and m.user_id=v.user_id where v.organization_id=${org}::uuid and v.id=${id}::uuid and hub_is_admin(${user},${org}::uuid)`,
      );
    },
    staff(user: string, org: string, p: PageInput) {
      return rows(
        sql`select user_id as id,coalesce(display_name,'') as name,created_at::text as "createdAt" from hub_memberships where organization_id=${org}::uuid and role='volunteer' and hub_is_admin(${user},${org}::uuid) and coalesce(display_name,'') ilike ${pattern(p.query)} ${page(p, sql`created_at`, sql`user_id`, "text")} order by created_at desc,user_id desc limit ${p.limit + 1}`,
      );
    },
    history(user: string, org: string, id: string, p: PageInput) {
      return rows(
        sql`select c.id,c.action,c.before,c.after,c.created_at::text as "createdAt",m.display_name as "actorName" from hub_volunteer_assignment_changes c left join hub_memberships m on m.organization_id=c.organization_id and m.user_id=c.actor_id where c.organization_id=${org}::uuid and c.assignment_id=${id}::uuid and hub_is_admin(${user},${org}::uuid) ${page(p, sql`c.created_at`, sql`c.id`)} order by c.created_at desc,c.id desc limit ${p.limit + 1}`,
      );
    },
    save(
      user: string,
      org: string,
      id: string | null,
      key: string | null,
      payload: Record<string, unknown>,
    ) {
      return rows(
        sql`select hub_save_access(${user},${org}::uuid,${id}::uuid,${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
      );
    },
  };
}
