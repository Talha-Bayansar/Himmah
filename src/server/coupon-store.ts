import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
const fields = sql`r.id,r.reward_name as "rewardName",r.cost,r.status,r.version,r.created_at::text as "createdAt",r.fulfilled_at::text as "fulfilledAt",r.cancelled_at::text as "cancelledAt"`;
export type CouponStore = ReturnType<typeof createCouponStore>;
export function createCouponStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  const rows = (s: SQL) =>
    execute
      ? execute(s)
      : db.execute(s).then((r) => r.rows as Record<string, unknown>[]);
  return {
    list(user: string, org: string, p: PageInput, status: string) {
      return rows(
        sql`select ${fields} from hub_redemptions r where r.organization_id=${org}::uuid and r.person_id=hub_participant_person(${user},${org}::uuid) and r.reward_name ilike ${"%" + p.query.replace(/[\\%_]/g, "\\$&") + "%"} ${status === "pending" ? sql`and r.status='pending'` : sql``} ${p.after ? sql`and (r.created_at,r.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by r.created_at desc,r.id desc limit ${p.limit + 1}`,
      );
    },
    get(user: string, org: string, id: string) {
      return rows(
        sql`select ${fields},case when r.status='pending' then c.code else null end as code from hub_redemptions r left join hub_reward_coupons c on c.organization_id=r.organization_id and c.redemption_id=r.id where r.organization_id=${org}::uuid and r.id=${id}::uuid and r.person_id=hub_participant_person(${user},${org}::uuid)`,
      );
    },
    claim(
      user: string,
      org: string,
      reward: string,
      key: string,
      version: number,
    ) {
      return rows(
        sql`select hub_claim_reward(${user},${org}::uuid,${reward}::uuid,${key}::uuid,${version}) as result`,
      );
    },
    cancel(user: string, org: string, id: string, version: number) {
      return rows(
        sql`select hub_cancel_my_coupon(${user},${org}::uuid,${id}::uuid,${version}) as result`,
      );
    },
    preview(user: string, org: string, code: string) {
      return rows(
        sql`select ${fields},r.person_name as "personName",(r.status='pending' and not hub_participant_is_self(${user},${org}::uuid,r.person_id)) as "canCollect" from hub_redemptions r join hub_reward_coupons c on c.organization_id=r.organization_id and c.redemption_id=r.id where c.organization_id=${org}::uuid and c.code=${code} and hub_is_admin(${user},${org}::uuid)`,
      );
    },
    collect(user: string, org: string, code: string, version: number) {
      return rows(
        sql`select hub_collect_coupon(${user},${org}::uuid,${code},${version}) as result`,
      );
    },
  };
}
