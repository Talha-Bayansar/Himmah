import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
const cursor = (p: PageInput, at: SQL, id: SQL) =>
  p.after
    ? sql`and (${at},${id})<(${p.after.at}::timestamptz,${p.after.id}::uuid)`
    : sql``;
const pattern = (q: string) => "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
const rewardProjection = sql`r.id,r.name,r.description,r.cost,r.stock,r.archived,r.version,r.created_at::text as "createdAt",(select count(*)::int from hub_redemptions where organization_id=r.organization_id and reward_id=r.id and status<>'cancelled') as used`;
const redemptionProjection = sql`id,reward_id as "rewardId",person_id as "personId",reward_name as "rewardName",person_name as "personName",cost,status,version,created_at::text as "createdAt",created_by_name as "createdByName",fulfilled_at::text as "fulfilledAt",fulfilled_by_name as "fulfilledByName",cancelled_at::text as "cancelledAt",cancelled_by_name as "cancelledByName",cancel_reason as "cancelReason"`;
export type RewardStore = ReturnType<typeof createRewardStore>;
export function createRewardStore(
  url: string,
  execute?: (st: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  const rows = async (st: SQL) =>
    execute
      ? execute(st)
      : ((await db.execute(st)).rows as Record<string, unknown>[]);
  return {
    list(user: string, org: string, p: PageInput) {
      return rows(
        sql`select ${rewardProjection} from hub_rewards r where r.organization_id=${org}::uuid and hub_is_admin(${user},${org}::uuid) and r.archived=${p.archived} and r.name ilike ${pattern(p.query)} ${cursor(p, sql`r.created_at`, sql`r.id`)} order by r.created_at desc,r.id desc limit ${p.limit + 1}`,
      );
    },
    get(user: string, org: string, id: string) {
      return rows(
        sql`select ${rewardProjection} from hub_rewards r where r.organization_id=${org}::uuid and r.id=${id}::uuid and hub_is_admin(${user},${org}::uuid)`,
      );
    },
    wallet(user: string, org: string, person: string) {
      return rows(
        sql`select p.id,p.name,w.earned::text,w.reserved::text,w.spent::text,w.available::text from hub_people p cross join lateral hub_reward_wallet(p.organization_id,p.id) w where p.organization_id=${org}::uuid and p.id=${person}::uuid and hub_is_admin(${user},${org}::uuid)`,
      );
    },
    members(
      user: string,
      org: string,
      id: string,
      p: PageInput,
      eligible: boolean,
    ) {
      return rows(
        sql`with reward as(select * from hub_rewards where organization_id=${org}::uuid and id=${id}::uuid and hub_is_admin(${user},${org}::uuid)), candidates as(select p.id,p.name,p.created_at as at,w.earned,w.reserved,w.spent,w.available, (not r.archived and w.available>=r.cost and (r.stock is null or r.stock>(select count(*) from hub_redemptions where organization_id=r.organization_id and reward_id=r.id and status<>'cancelled'))) as eligible from hub_people p cross join reward r cross join lateral hub_reward_wallet(p.organization_id,p.id) w where p.organization_id=${org}::uuid and not p.archived and p.name ilike ${pattern(p.query)}) select id,name,at::text as "createdAt",earned::text,reserved::text,spent::text,available::text,eligible from candidates where true ${eligible ? sql`and eligible` : sql``} ${cursor(p, sql`at`, sql`id`)} order by at desc,id desc limit ${p.limit + 1}`,
      );
    },
    redemptions(
      user: string,
      org: string,
      id: string,
      p: PageInput,
      status: string,
    ) {
      return rows(
        sql`select ${redemptionProjection} from hub_redemptions where organization_id=${org}::uuid and reward_id=${id}::uuid and hub_is_admin(${user},${org}::uuid) and person_name ilike ${pattern(p.query)} ${status === "all" ? sql`` : sql`and status=${status}`} ${cursor(p, sql`created_at`, sql`id`)} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    redemption(user: string, org: string, reward: string, id: string) {
      return rows(
        sql`select ${redemptionProjection} from hub_redemptions where organization_id=${org}::uuid and reward_id=${reward}::uuid and id=${id}::uuid and hub_is_admin(${user},${org}::uuid)`,
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
        sql`select hub_save_reward(${user},${org}::uuid,${id}::uuid,${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
      );
    },
    redeem(
      user: string,
      org: string,
      reward: string,
      id: string | null,
      key: string | null,
      payload: Record<string, unknown>,
    ) {
      return rows(
        sql`select hub_save_redemption(${user},${org}::uuid,${reward}::uuid,${id}::uuid,${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
      );
    },
  };
}
