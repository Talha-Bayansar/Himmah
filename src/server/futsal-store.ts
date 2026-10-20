import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
const fields = (includeSnapshot = true) =>
  sql`(select g.state->>'status' from futsal_games g where g.organization_id=s.organization_id and g.season_id=s.id) as "gameStatus",s.id,s.name,s.description,s.prize_criteria as "prizeCriteria",s.status,s.version,s.settings,s.seed,${includeSnapshot ? sql`s.snapshot` : sql`null::jsonb`} as snapshot,s.prepared_at::text as "preparedAt",s.cancel_reason as "cancelReason",s.created_at::text as "createdAt",(select count(*)::int from futsal_entries e where e.organization_id=s.organization_id and e.season_id=s.id) as "entryCount"`;
const pattern = (s: string) => "%" + s.replace(/[\\%_]/g, "\\$&") + "%";
const cursor = (p: PageInput, alias: string) =>
  p.after
    ? sql`and (${sql.raw(alias)}.created_at,${sql.raw(alias)}.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)`
    : sql``;
export type FutsalStore = ReturnType<typeof createFutsalStore>;
export function createFutsalStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url)),
    rows = (s: SQL) =>
      execute
        ? execute(s)
        : db.execute(s).then((r) => r.rows as Record<string, unknown>[]);
  const entrants = (user: string, org: string, id: string, p?: PageInput) =>
    rows(
      sql`select e.id,e.name,e.created_at::text as "createdAt",coalesce((select saved->'members' from jsonb_array_elements(s.snapshot->'entries') saved where saved->>'id'=e.id::text),(select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'archived',p.archived) order by p.id) from futsal_entry_members m join hub_people p on p.organization_id=m.organization_id and p.id=m.person_id where m.organization_id=e.organization_id and m.season_id=e.season_id and m.entry_id=e.id),'[]'::jsonb) as members from futsal_entries e join futsal_seasons s on s.organization_id=e.organization_id and s.id=e.season_id where e.organization_id=${org}::uuid and e.season_id=${id}::uuid and hub_is_admin(${user},${org}::uuid) ${p ? sql`and e.name ilike ${pattern(p.query)} ${cursor(p, "e")}` : sql``} order by e.created_at desc,e.id desc limit ${p ? p.limit + 1 : 17}`,
    );
  return {
    list(user: string, org: string, p: PageInput, status: string) {
      return rows(
        sql`select ${fields(false)} from futsal_seasons s where s.organization_id=${org}::uuid and hub_is_admin(${user},${org}::uuid) and s.name ilike ${pattern(p.query)} ${status === "all" ? sql`` : sql`and s.status=${status}`} ${cursor(p, "s")} order by s.created_at desc,s.id desc limit ${p.limit + 1}`,
      );
    },
    get(user: string, org: string, id: string) {
      return rows(
        sql`select ${fields()} from futsal_seasons s where s.organization_id=${org}::uuid and s.id=${id}::uuid and hub_is_admin(${user},${org}::uuid)`,
      );
    },
    entries: entrants,
    candidates(user: string, org: string, id: string, p: PageInput) {
      return rows(
        sql`select p.id,p.name,p.created_at::text as "createdAt",(select m.entry_id from futsal_entry_members m where m.organization_id=p.organization_id and m.season_id=${id}::uuid and m.person_id=p.id) as "assignedTo" from hub_people p where p.organization_id=${org}::uuid and not p.archived and hub_is_admin(${user},${org}::uuid) and p.name ilike ${pattern(p.query)} ${cursor(p, "p")} order by p.created_at desc,p.id desc limit ${p.limit + 1}`,
      );
    },
    command(
      user: string,
      org: string,
      id: string | null,
      entry: string | null,
      key: string,
      payload: unknown,
    ) {
      return rows(
        sql`select futsal_command(${user},${org}::uuid,${id}::uuid,${entry}::uuid,${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
      );
    },
  };
}
