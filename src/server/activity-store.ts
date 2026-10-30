import { neon } from "@neondatabase/serverless";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { ActivityInput, SessionInput } from "../activities/contracts.ts";
import type { PageInput } from "../community/contracts.ts";
const actor = (user: string, org: string, write = false) =>
  sql`actor as (select role from hub_memberships where organization_id=${org}::uuid and user_id=${user} ${write ? sql`and role in ('owner','admin')` : sql``} for update)`;
const groupArray = (ids: string[]) =>
  sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;
const validGroups = (org: string, ids: SQL) =>
  sql`(select count(*) from himmah.activity_groups where organization_id=${org}::uuid and id=any(${ids}) and not archived)=cardinality(${ids})`;
const groupProjection = (user: string, org: string, activity: SQL) =>
  sql`coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'archived',g.archived) order by g.name,g.id) from himmah.activity_groups g where g.organization_id=${org}::uuid and g.id=any(audience_group_ids) and hub_can_view_group(${user},${org}::uuid,g.id,${activity})), '[]'::jsonb) as groups`;
const base = (user: string, org: string, activity: SQL) =>
  sql`id,price_minor as "priceMinor",name,description,location,timezone,cancelled,version,created_at::text as "createdAt",CASE WHEN hub_is_admin(${user},${org}::uuid) THEN audience_group_ids ELSE ARRAY(SELECT gid FROM unnest(audience_group_ids) gid WHERE hub_can_view_group(${user},${org}::uuid,gid,${activity})) END as "audienceGroupIds"`;
const activityFrom = (user: string, org: string) =>
  sql`${base(user, org, sql`parent_row.id`)},${groupProjection(user, org, sql`parent_row.id`)}, (select jsonb_build_object('id',s.id,'startsAt',s.starts_at,'endsAt',s.ends_at,'timezone',s.timezone) from hub_activity_sessions s where s.organization_id=${org}::uuid and s.activity_id=parent_row.id and hub_can_view_session(${user},${org}::uuid,s.activity_id,s.id) and not s.cancelled and s.ends_at>now() order by s.starts_at,s.id limit 1) as "nextSession"`;
// Read-only overview: never materialize a roster or take command locks while listing.
const registrationOverview = (
  user: string,
  org: string,
) => sql`case when hub_can_attend_session(${user},${org}::uuid,parent_row.activity_id,parent_row.id) then (
 select jsonb_build_object('mode',coalesce(rs.mode,'open'),'capacity',rs.capacity,
 'confirmed',totals.visible,'remaining',case when rs.capacity is null then null else greatest(0,rs.capacity-totals.total) end)
 from (select count(*)::int as total,count(*) filter(where hub_can_attend_person(${user},${org}::uuid,parent_row.activity_id,parent_row.id,r.person_id))::int as visible
 from hub_session_registrations r where r.organization_id=parent_row.organization_id and r.session_id=parent_row.id and r.status='confirmed') totals
 left join hub_session_registration_settings rs on rs.organization_id=parent_row.organization_id and rs.session_id=parent_row.id
 ) else null end as "registration"`;
const sessionProjection = (user: string, org: string) =>
  sql`${base(user, org, sql`parent_row.activity_id`)},${registrationOverview(user, org)},(exists(select 1 from hub_session_registrations pr where pr.organization_id=parent_row.organization_id and pr.session_id=parent_row.id) or exists(select 1 from hub_registration_charges ch where ch.organization_id=parent_row.organization_id and ch.session_id=parent_row.id)) as "pricingLocked",exists(select 1 from hub_session_registration_settings rs where rs.organization_id=parent_row.organization_id and rs.session_id=parent_row.id and rs.mode='required' and parent_row.starts_at<=clock_timestamp()+interval '30 minutes') as "registrationLocked",hub_can_attend_session(${user},${org}::uuid,activity_id,id) as "canAttend",hub_can_collect_session(${user},${org}::uuid,activity_id,id) as "canCollect",activity_id as "activityId",starts_at::text as "startsAt",ends_at::text as "endsAt",cancellation_reason as "cancellationReason",${groupProjection(user, org, sql`parent_row.activity_id`)}`;
const logged = (user: string, org: string, action: string) =>
  sql`logged as (insert into hub_directory_audit(organization_id,actor_id,action,entity_id) select ${org}::uuid,${user},${action},id::text from changed parent_row returning id)`;
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
    deletionPreview(user: string, org: string, id: string) {
      return rows(
        sql`select hub_activity_deletion_preview(${user},${org}::uuid,${id}::uuid) as result`,
      );
    },
    deleteActivity(
      user: string,
      org: string,
      id: string,
      key: string,
      snapshot: string,
    ) {
      return rows(
        sql`select hub_delete_activity(${user},${org}::uuid,${id}::uuid,${key}::uuid,${snapshot}) as result`,
      );
    },
    list(user: string, org: string, p: PageInput) {
      return rows(
        sql`with ${actor(user, org)} select ${activityFrom(user, org)} from hub_activities parent_row where organization_id=${org}::uuid and exists(select 1 from actor) and hub_can_view_activity(${user},${org}::uuid,id) and cancelled=${p.archived} and name ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} ${p.after ? sql`and (created_at,id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    get(user: string, org: string, id: string) {
      return rows(
        sql`with ${actor(user, org)} select ${activityFrom(user, org)} from hub_activities parent_row where organization_id=${org}::uuid and id=${id}::uuid and exists(select 1 from actor) and hub_can_view_activity(${user},${org}::uuid,id) limit 1`,
      );
    },
    create(user: string, org: string, key: string, v: ActivityInput) {
      const ids = groupArray(v.audienceGroupIds);
      return rows(
        sql`with ${actor(user, org, true)}, changed as (insert into hub_activities(organization_id,price_minor,name,description,location,timezone,audience_group_ids,created_by,creation_key) select ${org}::uuid,${v.priceMinor ?? 0},${v.name},${v.description},${v.location},${v.timezone},${ids},${user},${key}::uuid where exists(select 1 from actor) and ${validGroups(org, ids)} on conflict(organization_id,creation_key) do nothing returning *), ${logged(user, org, "activity.create")} select ${base(user, org, sql`parent_row.id`)},${groupProjection(user, org, sql`parent_row.id`)},null::jsonb as "nextSession" from changed parent_row union all select ${activityFrom(user, org)} from hub_activities parent_row where organization_id=${org}::uuid and creation_key=${key}::uuid and created_by=${user} and exists(select 1 from actor) and not exists(select 1 from changed parent_row) and price_minor=${v.priceMinor ?? 0} and name=${v.name} and description=${v.description} and location=${v.location} and audience_group_ids=${ids} and timezone=${v.timezone} limit 1`,
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
        sql`with ${actor(user, org, true)}, changed as (update hub_activities set price_minor=coalesce(${v.priceMinor ?? null}::int,price_minor),name=${v.name},description=${v.description},location=${v.location},audience_group_ids=${ids},version=version+1 where organization_id=${org}::uuid and id=${id}::uuid and version=${version} and not cancelled and timezone=${v.timezone} and exists(select 1 from actor) and ${validGroups(org, ids)} returning *),${logged(user, org, "activity.edit")} select ${base(user, org, sql`parent_row.id`)},${groupProjection(user, org, sql`parent_row.id`)},null::jsonb as "nextSession" from changed parent_row`,
      );
    },
    cancel(user: string, org: string, id: string, version: number) {
      return rows(
        sql`with ${actor(user, org, true)},changed as(update hub_activities set cancelled=true,version=version+1 where organization_id=${org}::uuid and id=${id}::uuid and version=${version} and not cancelled and exists(select 1 from actor) returning *),${logged(user, org, "activity.archive")} select ${base(user, org, sql`parent_row.id`)},${groupProjection(user, org, sql`parent_row.id`)},null::jsonb as "nextSession" from changed parent_row`,
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
        sql`with ${actor(user, org)} select ${sessionProjection(user, org)} from hub_activity_sessions parent_row where organization_id=${org}::uuid and activity_id=${activity}::uuid and exists(select 1 from actor) and hub_can_view_session(${user},${org}::uuid,activity_id,id) and ends_at ${ascending ? sql`>` : sql`<=`} now() ${p.after ? sql`and (starts_at,id) ${ascending ? sql`>` : sql`<`} (${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by starts_at ${ascending ? sql`asc` : sql`desc`},id ${ascending ? sql`asc` : sql`desc`} limit ${p.limit + 1}`,
      );
    },
    session(user: string, org: string, activity: string, id: string) {
      return rows(
        sql`with ${actor(user, org)} select ${sessionProjection(user, org)} from hub_activity_sessions parent_row where organization_id=${org}::uuid and activity_id=${activity}::uuid and id=${id}::uuid and exists(select 1 from actor) and hub_can_view_session(${user},${org}::uuid,activity_id,id) limit 1`,
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
        sql`with ${actor(user, org, true)},parent as(select * from hub_activities parent_row where organization_id=${org}::uuid and id=${activity}::uuid and not cancelled and version=${activityVersion} and exists(select 1 from actor) for update),changed as(insert into hub_activity_sessions(organization_id,activity_id,price_minor,name,description,location,timezone,audience_group_ids,starts_at,ends_at,created_by,creation_key) select ${org}::uuid,id,coalesce(${v.priceMinor ?? null}::int,price_minor),name,description,${v.location},timezone,audience_group_ids,${v.startsAt}::timestamptz,${v.endsAt}::timestamptz,${user},${key}::uuid from parent where timezone=${v.timezone} and ${v.startsAt}::timestamptz>now() and ${validGroups(org, sql`parent.audience_group_ids`)} on conflict(organization_id,activity_id,creation_key) do nothing returning *),${logged(user, org, "session.create")} select ${sessionProjection(user, org)} from changed parent_row union all select ${sessionProjection(user, org)} from hub_activity_sessions parent_row where organization_id=${org}::uuid and activity_id=${activity}::uuid and creation_key=${key}::uuid and created_by=${user} and exists(select 1 from actor) and not exists(select 1 from changed parent_row) and price_minor=coalesce(${v.priceMinor ?? null}::int,(select a.price_minor from hub_activities a where a.organization_id=${org}::uuid and a.id=${activity}::uuid and a.version=${activityVersion})) and starts_at=${v.startsAt}::timestamptz and ends_at=${v.endsAt}::timestamptz and location=${v.location} and timezone=${v.timezone} limit 1`,
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
        sql`with ${actor(user, org, true)},changed as(update hub_activity_sessions set price_minor=coalesce(${v.priceMinor ?? null}::int,price_minor),starts_at=${v.startsAt}::timestamptz,ends_at=${v.endsAt}::timestamptz,location=${v.location},version=version+1 where organization_id=${org}::uuid and activity_id=${activity}::uuid and id=${id}::uuid and version=${version} and not cancelled and starts_at>now() and ${v.startsAt}::timestamptz>now() and timezone=${v.timezone} and (price_minor=coalesce(${v.priceMinor ?? null}::int,price_minor) or (not exists(select 1 from hub_session_registrations pr where pr.organization_id=hub_activity_sessions.organization_id and pr.session_id=hub_activity_sessions.id) and not exists(select 1 from hub_registration_charges ch where ch.organization_id=hub_activity_sessions.organization_id and ch.session_id=hub_activity_sessions.id))) and (not exists(select 1 from hub_session_registration_settings rs where rs.organization_id=hub_activity_sessions.organization_id and rs.session_id=hub_activity_sessions.id and rs.mode='required') or (starts_at>now()+interval '30 minutes' and ${v.startsAt}::timestamptz>now()+interval '30 minutes')) and exists(select 1 from actor) returning *),${logged(user, org, "session.edit")} select ${sessionProjection(user, org)} from changed parent_row`,
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
        sql`with ${actor(user, org, true)},changed as(update hub_activity_sessions set cancelled=true,cancellation_reason=${reason},version=version+1 where organization_id=${org}::uuid and activity_id=${activity}::uuid and id=${id}::uuid and version=${version} and not cancelled and starts_at>now() and exists(select 1 from actor) returning *),${logged(user, org, "session.cancel")} select ${sessionProjection(user, org)} from changed parent_row`,
      );
    },
  };
}
