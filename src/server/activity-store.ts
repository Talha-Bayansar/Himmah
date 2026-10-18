import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
import type { ActivityInput } from "../activities/contracts.ts";
const actor = (user: string, org: string, write = false) =>
  sql`actor as (select role from hub_memberships where organization_id=${org}::uuid and user_id=${user} ${write ? sql`and role in ('owner','admin')` : sql``} for update)`;
const projection = sql`id,name,description,location,starts_at::text as "startsAt",ends_at::text as "endsAt",timezone,cancelled,version,created_at::text as "createdAt"`;
const logged = (user: string, org: string, action: string) =>
  sql`logged as (insert into hub_directory_audit (organization_id,actor_id,action,entity_id) select ${org}::uuid,${user},${action},id::text from changed returning id)`;
export type ActivityStore = ReturnType<typeof createActivityStore>;
export function createActivityStore(
  url: string,
  execute?: (statement: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  const rows = async (statement: SQL) =>
    execute
      ? execute(statement)
      : ((await db.execute(statement)).rows as Record<string, unknown>[]);
  return {
    list(user: string, org: string, p: PageInput) {
      return rows(
        sql`with ${actor(user, org)} select ${projection} from hub_activities where organization_id=${org}::uuid and exists(select 1 from actor) and cancelled=${p.archived} and name ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} ${p.after ? sql`and (created_at,id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    get(user: string, org: string, id: string) {
      return rows(
        sql`with ${actor(user, org)} select ${projection} from hub_activities where organization_id=${org}::uuid and id=${id}::uuid and exists(select 1 from actor) limit 1`,
      );
    },
    create(user: string, org: string, key: string, v: ActivityInput) {
      return rows(
        sql`with ${actor(user, org, true)}, changed as (insert into hub_activities (organization_id,name,description,location,starts_at,ends_at,timezone,created_by,creation_key) select ${org}::uuid,${v.name},${v.description},${v.location},${v.startsAt}::timestamptz,${v.endsAt}::timestamptz,${v.timezone},${user},${key}::uuid where exists(select 1 from actor) on conflict (organization_id,creation_key) do nothing returning *), ${logged(user, org, "activity.create")} select ${projection} from changed union all select ${projection} from hub_activities where organization_id=${org}::uuid and creation_key=${key}::uuid and created_by=${user} and exists(select 1 from actor) and not exists(select 1 from changed) and name=${v.name} and description=${v.description} and location=${v.location} and starts_at=${v.startsAt}::timestamptz and ends_at=${v.endsAt}::timestamptz and timezone=${v.timezone} limit 1`,
      );
    },
    update(
      user: string,
      org: string,
      id: string,
      version: number,
      v: ActivityInput,
    ) {
      return rows(
        sql`with ${actor(user, org, true)}, changed as (update hub_activities set name=${v.name},description=${v.description},location=${v.location},starts_at=${v.startsAt}::timestamptz,ends_at=${v.endsAt}::timestamptz,version=version+1 where organization_id=${org}::uuid and id=${id}::uuid and version=${version} and not cancelled and timezone=${v.timezone} and exists(select 1 from actor) returning *) ,${logged(user, org, "activity.edit")} select ${projection} from changed`,
      );
    },
    cancel(user: string, org: string, id: string, version: number) {
      return rows(
        sql`with ${actor(user, org, true)}, changed as (update hub_activities set cancelled=true,version=version+1 where organization_id=${org}::uuid and id=${id}::uuid and version=${version} and not cancelled and exists(select 1 from actor) returning *),${logged(user, org, "activity.cancel")} select ${projection} from changed`,
      );
    },
  };
}
