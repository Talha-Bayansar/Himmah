import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
import type { ActivityInput, SessionInput } from "../activities/contracts.ts";
const actor = (user: string, org: string, write = false) =>
  sql`actor as (select role from hub_memberships where organization_id=${org}::uuid and user_id=${user} ${write ? sql`and role in ('owner','admin')` : sql``} for update)`;
const groupArray = (ids: string[]) =>
  sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;
const validGroups = (org: string, ids: SQL) =>
  sql`(select count(*) from hub_groups where organization_id=${org}::uuid and id=any(${ids}) and not archived)=cardinality(${ids})`;
const groupProjection = (org: string) =>
  sql`coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'archived',g.archived) order by g.name,g.id) from hub_groups g where g.organization_id=${org}::uuid and g.id=any(audience_group_ids)), '[]'::jsonb) as groups`;
const base = sql`id,name,description,location,timezone,cancelled,version,created_at::text as "createdAt",audience_group_ids as "audienceGroupIds"`;
const activityFrom = (org: string) =>
  sql`${base},${groupProjection(org)}, (select jsonb_build_object('id',s.id,'startsAt',s.starts_at,'endsAt',s.ends_at,'timezone',s.timezone) from hub_activity_sessions s where s.organization_id=${org}::uuid and s.activity_id=hub_activities.id and not s.cancelled and s.ends_at>now() order by s.starts_at,s.id limit 1) as "nextSession"`;
const sessionProjection = (org: string) =>
  sql`${base},activity_id as "activityId",starts_at::text as "startsAt",ends_at::text as "endsAt",cancellation_reason as "cancellationReason",${groupProjection(org)}`;
const logged = (user: string, org: string, action: string) =>
  sql`logged as (insert into hub_directory_audit(organization_id,actor_id,action,entity_id) select ${org}::uuid,${user},${action},id::text from changed returning id)`;
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
        sql`with ${actor(user, org)} select ${activityFrom(org)} from hub_activities where organization_id=${org}::uuid and exists(select 1 from actor) and cancelled=${p.archived} and name ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} ${p.after ? sql`and (created_at,id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    get(user: string, org: string, id: string) {
      return rows(
        sql`with ${actor(user, org)} select ${activityFrom(org)} from hub_activities where organization_id=${org}::uuid and id=${id}::uuid and exists(select 1 from actor) limit 1`,
      );
    },
    create(user: string, org: string, key: string, v: ActivityInput) {
      const ids = groupArray(v.audienceGroupIds);
      return rows(
        sql`with ${actor(user, org, true)}, changed as (insert into hub_activities(organization_id,name,description,location,timezone,audience_group_ids,created_by,creation_key) select ${org}::uuid,${v.name},${v.description},${v.location},${v.timezone},${ids},${user},${key}::uuid where exists(select 1 from actor) and ${validGroups(org, ids)} on conflict(organization_id,creation_key) do nothing returning *), ${logged(user, org, "activity.create")} select ${base},${groupProjection(org)},null::jsonb as "nextSession" from changed union all select ${activityFrom(org)} from hub_activities where organization_id=${org}::uuid and creation_key=${key}::uuid and created_by=${user} and exists(select 1 from actor) and not exists(select 1 from changed) and name=${v.name} and description=${v.description} and location=${v.location} and audience_group_ids=${ids} and timezone=${v.timezone} limit 1`,
      );
    },
    update(
      user: string,
      org: string,
      id: string,
      version: number,
      v: ActivityInput,
    ) {
      const ids = groupArray(v.audienceGroupIds);
      return rows(
        sql`with ${actor(user, org, true)}, changed as (update hub_activities set name=${v.name},description=${v.description},location=${v.location},audience_group_ids=${ids},version=version+1 where organization_id=${org}::uuid and id=${id}::uuid and version=${version} and not cancelled and timezone=${v.timezone} and exists(select 1 from actor) and ${validGroups(org, ids)} returning *),${logged(user, org, "activity.edit")} select ${base},${groupProjection(org)},null::jsonb as "nextSession" from changed`,
      );
    },
    cancel(user: string, org: string, id: string, version: number) {
      return rows(
        sql`with ${actor(user, org, true)},changed as(update hub_activities set cancelled=true,version=version+1 where organization_id=${org}::uuid and id=${id}::uuid and version=${version} and not cancelled and exists(select 1 from actor) returning *),${logged(user, org, "activity.archive")} select ${base},${groupProjection(org)},null::jsonb as "nextSession" from changed`,
      );
    },
    sessions(
      user: string,
      org: string,
      activity: string,
      p: PageInput,
      view: "upcoming" | "past",
    ) {
      const ascending = view === "upcoming";
      return rows(
        sql`with ${actor(user, org)} select ${sessionProjection(org)} from hub_activity_sessions where organization_id=${org}::uuid and activity_id=${activity}::uuid and exists(select 1 from actor) and ends_at ${ascending ? sql`>` : sql`<=`} now() ${p.after ? sql`and (starts_at,id) ${ascending ? sql`>` : sql`<`} (${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by starts_at ${ascending ? sql`asc` : sql`desc`},id ${ascending ? sql`asc` : sql`desc`} limit ${p.limit + 1}`,
      );
    },
    session(user: string, org: string, activity: string, id: string) {
      return rows(
        sql`with ${actor(user, org)} select ${sessionProjection(org)} from hub_activity_sessions where organization_id=${org}::uuid and activity_id=${activity}::uuid and id=${id}::uuid and exists(select 1 from actor) limit 1`,
      );
    },
    createSession(
      user: string,
      org: string,
      activity: string,
      key: string,
      activityVersion: number,
      v: SessionInput,
    ) {
      return rows(
        sql`with ${actor(user, org, true)},parent as(select * from hub_activities where organization_id=${org}::uuid and id=${activity}::uuid and not cancelled and version=${activityVersion} and exists(select 1 from actor) for update),changed as(insert into hub_activity_sessions(organization_id,activity_id,name,description,location,timezone,audience_group_ids,starts_at,ends_at,created_by,creation_key) select ${org}::uuid,id,name,description,${v.location},timezone,audience_group_ids,${v.startsAt}::timestamptz,${v.endsAt}::timestamptz,${user},${key}::uuid from parent where timezone=${v.timezone} and ${v.startsAt}::timestamptz>now() and ${validGroups(org, sql`parent.audience_group_ids`)} on conflict(organization_id,activity_id,creation_key) do nothing returning *),${logged(user, org, "session.create")} select ${sessionProjection(org)} from changed union all select ${sessionProjection(org)} from hub_activity_sessions where organization_id=${org}::uuid and activity_id=${activity}::uuid and creation_key=${key}::uuid and created_by=${user} and exists(select 1 from actor) and not exists(select 1 from changed) and starts_at=${v.startsAt}::timestamptz and ends_at=${v.endsAt}::timestamptz and location=${v.location} and timezone=${v.timezone} limit 1`,
      );
    },
    updateSession(
      user: string,
      org: string,
      activity: string,
      id: string,
      version: number,
      v: SessionInput,
    ) {
      return rows(
        sql`with ${actor(user, org, true)},changed as(update hub_activity_sessions set starts_at=${v.startsAt}::timestamptz,ends_at=${v.endsAt}::timestamptz,location=${v.location},version=version+1 where organization_id=${org}::uuid and activity_id=${activity}::uuid and id=${id}::uuid and version=${version} and not cancelled and starts_at>now() and ${v.startsAt}::timestamptz>now() and timezone=${v.timezone} and exists(select 1 from actor) returning *),${logged(user, org, "session.edit")} select ${sessionProjection(org)} from changed`,
      );
    },
    cancelSession(
      user: string,
      org: string,
      activity: string,
      id: string,
      version: number,
      reason: string,
    ) {
      return rows(
        sql`with ${actor(user, org, true)},changed as(update hub_activity_sessions set cancelled=true,cancellation_reason=${reason},version=version+1 where organization_id=${org}::uuid and activity_id=${activity}::uuid and id=${id}::uuid and version=${version} and not cancelled and starts_at>now() and exists(select 1 from actor) returning *),${logged(user, org, "session.cancel")} select ${sessionProjection(org)} from changed`,
      );
    },
  };
}
