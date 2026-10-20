import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
export function createFutsalGameStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url)),
    rows = (s: SQL) =>
      execute
        ? execute(s)
        : db.execute(s).then((r) => r.rows as Record<string, unknown>[]);
  const eligible = (user: string, org: string) =>
    sql`not exists(select 1 from hub_memberships access where access.organization_id=s.organization_id and access.user_id=${user}) and exists(select 1 from futsal_entry_members m where m.organization_id=s.organization_id and m.season_id=s.id and m.person_id=hub_participant_person(${user},${org}::uuid))`;
  return {
    participantList: (user: string, org: string, p: PageInput) =>
      rows(
        sql`select s.id,s.name,s.created_at::text as "createdAt",g.state->>'status' as status from futsal_seasons s join futsal_games g on g.organization_id=s.organization_id and g.season_id=s.id where s.organization_id=${org}::uuid and s.status='prepared' and ${eligible(user, org)} ${p.after ? sql`and(s.created_at,s.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by s.created_at desc,s.id desc limit ${p.limit + 1}`,
      ),
    participantGet: (user: string, org: string, id: string) =>
      rows(
        sql`select s.id,s.name,s.settings,s.snapshot->'plan' as plan,(select m.entry_id from futsal_entry_members m where m.organization_id=s.organization_id and m.season_id=s.id and m.person_id=hub_participant_person(${user},${org}::uuid)) as "ownEntryId",g.state,s.created_at::text as "createdAt" from futsal_seasons s join futsal_games g on g.organization_id=s.organization_id and g.season_id=s.id where s.organization_id=${org}::uuid and s.id=${id}::uuid and s.status='prepared' and ${eligible(user, org)}`,
      ),
    participantTraining: (
      user: string,
      org: string,
      id: string,
      p: PageInput,
    ) =>
      rows(
        sql`select e.id,e.created_at::text as "createdAt",jsonb_build_object('at',e.event->'at','growth',coalesce((select jsonb_agg(item-'personId') from jsonb_array_elements(e.event->'growth') item where item->>'personId'=hub_participant_person(${user},${org}::uuid)::text),'[]'::jsonb)) as event from futsal_game_events e join futsal_seasons s on s.organization_id=e.organization_id and s.id=e.season_id where e.organization_id=${org}::uuid and e.season_id=${id}::uuid and s.status='prepared' and ${eligible(user, org)} and e.event->>'kind'='training' ${p.after ? sql`and(e.created_at,e.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by e.created_at desc,e.id desc limit ${p.limit + 1}`,
      ),
    get: (user: string, org: string, id: string) =>
      rows(
        sql`select state,version,futsal_game_now()::text as now from futsal_games where organization_id=${org}::uuid and season_id=${id}::uuid and hub_is_admin(${user},${org}::uuid)`,
      ),
    points: (user: string, org: string, id: string, index: number) =>
      rows(
        sql`select futsal_game_points(${org}::uuid,${id}::uuid,${index}) as points where hub_is_admin(${user},${org}::uuid)`,
      ),
    receipt: (user: string, org: string, key: string) =>
      rows(
        sql`select season_id::text as "seasonId",actor_id as "actorId",request,version from futsal_game_events where organization_id=${org}::uuid and request_key=${key}::uuid and hub_is_admin(${user},${org}::uuid)`,
      ),
    events: (user: string, org: string, id: string, p: PageInput) =>
      rows(
        sql`select id,version,event,created_at::text as "createdAt" from futsal_game_events where organization_id=${org}::uuid and season_id=${id}::uuid and hub_is_admin(${user},${org}::uuid) ${p.after ? sql`and(created_at,id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by created_at desc,id desc limit ${p.limit + 1}`,
      ),
    commit: (
      user: string,
      org: string,
      id: string,
      key: string,
      request: unknown,
      prior: unknown,
      points: unknown,
      state: unknown,
      event: unknown,
    ) =>
      rows(
        sql`select futsal_game_commit(${user},${org}::uuid,${id}::uuid,${key}::uuid,${JSON.stringify(request)}::jsonb,${JSON.stringify(prior)}::jsonb,${JSON.stringify(points)}::jsonb,${JSON.stringify(state)}::jsonb,${JSON.stringify(event)}::jsonb) as result`,
      ),
  };
}
export type FutsalGameStore = ReturnType<typeof createFutsalGameStore>;
