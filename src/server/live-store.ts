import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
export type LiveStore = ReturnType<typeof createLiveStore>;
export function createLiveStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  const rows = async (s: SQL) =>
    execute
      ? execute(s)
      : ((await db.execute(s)).rows as Record<string, unknown>[]);
  const after = (p: PageInput, column: SQL) =>
    p.after
      ? sql`and (${column},id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)`
      : sql``;
  return {
    host: (
      actor: string,
      org: string,
      item: string,
      room: string,
      key: string,
      p: Record<string, unknown>,
    ) =>
      rows(
        sql`select hub_live_host(${actor},${org}::uuid,${item}::uuid,${room}::uuid,${key}::uuid,${JSON.stringify(p)}::jsonb) as result`,
      ),
    read: (actor: string, org: string, item: string, room: string) =>
      rows(
        sql`select hub_live_read(${actor},${org}::uuid,${item}::uuid,${room}::uuid) as result`,
      ),
    public: (code: string, hash: string) =>
      rows(sql`select hub_live_public(${code},${hash}) as result`),
    guest: (
      code: string,
      hash: string,
      key: string,
      p: Record<string, unknown>,
    ) =>
      rows(
        sql`select hub_live_guest(${code},${hash},${key}::uuid,${JSON.stringify(p)}::jsonb) as result`,
      ),
    list: (actor: string, org: string, item: string, p: PageInput) =>
      rows(
        sql`select r.id,r.code,r.state,r.expires_at as "expiresAt",r.created_at::text as "createdAt",v.content->>'title' as title from hub_live_rooms r join hub_learning_versions v on v.organization_id=r.organization_id and v.id=r.publication_id and v.item_id=r.item_id where r.organization_id=${org}::uuid and r.item_id=${item}::uuid and hub_learning_admin(${actor},${org}::uuid) ${p.after ? sql`and (r.created_at,r.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by r.created_at desc,r.id desc limit ${p.limit + 1}`,
      ),
    players: (
      actor: string,
      org: string,
      item: string,
      room: string,
      p: PageInput,
    ) =>
      rows(
        sql`select id,nickname,number,revoked,created_at::text as "createdAt" from hub_live_players where organization_id=${org}::uuid and room_id=${room}::uuid and hub_learning_admin(${actor},${org}::uuid) and exists(select 1 from hub_live_rooms where organization_id=${org}::uuid and item_id=${item}::uuid and id=${room}::uuid) and (coalesce(nickname,'')||' '||number::text) ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} ${after(p, sql`created_at`)} order by created_at desc,id desc limit ${p.limit + 1}`,
      ),
  };
}
