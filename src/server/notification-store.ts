import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
import type { pushInput } from "../notifications/contracts.ts";
export type NotificationStore = ReturnType<typeof createNotificationStore>;
export function createNotificationStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  const rows = (s: SQL) =>
    execute
      ? execute(s)
      : db.execute(s).then((r) => r.rows as Record<string, unknown>[]);
  return {
    list(user: string, org: string, p: PageInput) {
      return rows(
        sql`select n.id,n.kind,n.href,n.read_at::text as "readAt",n.created_at::text as "createdAt" from hub_notifications n where n.organization_id=${org}::uuid and n.user_id=${user} and hub_notification_visible(n,${user}) ${p.after ? sql`and (n.created_at,n.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by n.created_at desc,n.id desc limit ${p.limit + 1}`,
      );
    },
    unread(user: string, org: string) {
      return rows(
        sql`select count(*)::int as count from (select 1 from hub_notifications n where n.organization_id=${org}::uuid and n.user_id=${user} and n.read_at is null and hub_notification_visible(n,${user}) limit 100) unread`,
      );
    },
    read(user: string, org: string, id: string | null) {
      return rows(
        sql`with marked as (update hub_notifications n set read_at=now() where n.organization_id=${org}::uuid and n.user_id=${user} and hub_notification_visible(n,${user}) ${id ? sql`and n.id=${id}::uuid` : sql``} and n.read_at is null returning 1) select count(*)::int as count from marked`,
      );
    },
    register(user: string, b: ReturnType<typeof pushInput>) {
      return rows(
        sql`select hub_register_push(${user},${b.endpoint},${b.p256dh},${b.auth},${b.locale}) as ok`,
      );
    },
    device(user: string, endpoint: string) {
      return rows(
        sql`select id,locale from hub_push_devices where user_id=${user} and endpoint=${endpoint}`,
      );
    },
    remove(user: string, endpoint: string | null) {
      return rows(
        sql`delete from hub_push_devices where user_id=${user} ${endpoint ? sql`and endpoint=${endpoint}` : sql``} returning id`,
      );
    },
    async claim() {
      await rows(
        sql`update hub_push_deliveries set state='dead',lease=null where state in ('pending','sending') and (created_at<now()-interval '24 hours' or (attempts>=5 and next_at<=now()))`,
      );
      return rows(
        sql`with due as (select id from hub_push_deliveries where next_at<=now() and attempts<5 and state in ('pending','sending') order by next_at,id for update skip locked limit 20) update hub_push_deliveries d set state='sending',attempts=d.attempts+1,lease=gen_random_uuid(),next_at=now()+interval '5 minutes' from due where d.id=due.id returning d.id,d.lease,d.attempts`,
      );
    },
    target(id: string, lease: string) {
      return rows(
        sql`select d.id,n.organization_id as "organizationId",s.id as "deviceId",s.endpoint,s.p256dh,s.auth,s.locale from hub_push_deliveries d join hub_notifications n on n.id=d.notification_id join hub_push_devices s on s.id=d.device_id and s.user_id=n.user_id where d.id=${id}::uuid and d.lease=${lease}::uuid and d.state='sending' and d.next_at>now() and n.read_at is null and d.created_at>now()-interval '24 hours' and hub_notification_visible(n,n.user_id)`,
      );
    },
    finish(id: string, lease: string, state: string, delay: number) {
      return rows(
        sql`update hub_push_deliveries set state=${state},lease=null,next_at=now()+${delay}*interval '1 second' where id=${id}::uuid and lease=${lease}::uuid returning id`,
      );
    },
    expired(device: string) {
      return rows(
        sql`delete from hub_push_devices where id=${device}::uuid returning id`,
      );
    },
  };
}
