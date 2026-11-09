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
  const usable = (alias: "n" | "older") => {
    const n = sql.raw(alias);
    return sql`${n}.read_at is null and hub_notification_visible(${n},${n}.user_id) and (${n}.kind in ('staff_notice','session_started') or ${n}.planned_at>now())`;
  };
  const priority = (alias: "n" | "older") => {
    const n = sql.raw(alias);
    return sql`case when ${n}.kind='session_cancelled' and ${n}.planned_at<=now()+interval '2 hours' then 0 when ${n}.kind='session_started' then 1 when ${n}.kind='session_reminder' then 2 else 3 end`;
  };
  const deadline = sql`case when n.kind='session_started' then (select least(s.ends_at,s.starts_at+interval '15 minutes') from hub_activity_sessions s where s.organization_id=n.organization_id and s.activity_id=n.activity_id and s.id=n.session_id) else n.planned_at end`;
  return {
    list(user: string, org: string, p: PageInput) {
      return rows(
        sql`select n.id,n.kind,case when n.kind='staff_notice' then n.href else hub_session_notice_href(${user},n.organization_id,n.activity_id,n.session_id) end as href,(select coalesce(nullif(s.topic,''),s.name) from hub_activity_sessions s where s.organization_id=n.organization_id and s.activity_id=n.activity_id and s.id=n.session_id) as subject,n.planned_at::text as "startsAt",(select s.timezone from hub_activity_sessions s where s.organization_id=n.organization_id and s.activity_id=n.activity_id and s.id=n.session_id) as timezone,n.read_at::text as "readAt",n.created_at::text as "createdAt" from hub_notifications n where n.organization_id=${org}::uuid and n.user_id=${user} and hub_notification_visible(n,${user}) ${p.after ? sql`and (n.created_at,n.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)` : sql``} order by n.created_at desc,n.id desc limit ${p.limit + 1}`,
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
        sql`with due as (
 select d.id from hub_push_deliveries d join hub_notifications n on n.id=d.notification_id
 where d.next_at<=now() and d.attempts<5 and d.state in ('pending','sending') and ${usable("n")}
 and not exists(select 1 from hub_push_deliveries earlier join hub_notifications older on older.id=earlier.notification_id
 where earlier.device_id=d.device_id and earlier.id<>d.id and
 ((earlier.state='sending' and earlier.next_at>now()) or
 (earlier.state in ('pending','sending') and earlier.attempts<5 and earlier.next_at<=now() and ${usable("older")}
 and (${priority("older")},earlier.next_at,earlier.id)<(${priority("n")},d.next_at,d.id))))
 order by ${priority("n")},d.next_at,d.id for update of d skip locked limit 20)
 update hub_push_deliveries d set state='sending',attempts=d.attempts+1,lease=gen_random_uuid(),next_at=now()+interval '5 minutes'
 from due where d.id=due.id returning d.id,d.lease,d.attempts`,
      );
    },
    target(id: string, lease: string) {
      return rows(
        sql`select d.id,n.organization_id as "organizationId",s.id as "deviceId",s.endpoint,s.p256dh,s.auth,s.locale,coalesce((select quiet_enabled from hub_organization_settings where organization_id=n.organization_id),true) as "quietEnabled",coalesce((select quiet_start from hub_organization_settings where organization_id=n.organization_id),1320) as "quietStart",coalesce((select quiet_end from hub_organization_settings where organization_id=n.organization_id),480) as "quietEnd",n.kind,n.session_id as "sessionId",n.created_at::text as "createdAt",n.planned_at::text as "plannedAt",(${deadline})::text as "expiresAt",(select timezone from hub_organizations where id=n.organization_id) as timezone,
 (select max(sent.next_at)::text from hub_push_deliveries sent where sent.device_id=s.id and sent.state='sent') as "latestPushAt",
 exists(select 1 from hub_notifications changed where changed.organization_id=n.organization_id and changed.user_id=n.user_id and changed.session_id=n.session_id and changed.kind in ('session_changed','session_cancelled') and changed.created_at>=now()-interval '10 minutes' and hub_notification_visible(changed,changed.user_id)) as "recentChange",
 case when n.kind='staff_notice' then '/workspace/'||n.organization_id||'/notifications' else hub_session_notice_href(n.user_id,n.organization_id,n.activity_id,n.session_id) end as href,case when n.kind='staff_notice' then 3600 else greatest(1,least(3600,floor(extract(epoch from ((${deadline})-now())))::int)) end as ttl from hub_push_deliveries d join hub_notifications n on n.id=d.notification_id join hub_push_devices s on s.id=d.device_id and s.user_id=n.user_id where d.id=${id}::uuid and d.lease=${lease}::uuid and d.state='sending' and d.next_at>now() and n.read_at is null and d.created_at>now()-interval '24 hours' and hub_notification_visible(n,n.user_id) and (n.kind in ('staff_notice','session_started') or n.planned_at>now())`,
      );
    },
    defer(id: string, lease: string, delay: number) {
      return rows(
        sql`update hub_push_deliveries set state='pending',lease=null,attempts=greatest(0,attempts-1),next_at=now()+${delay}*interval '1 second' where id=${id}::uuid and lease=${lease}::uuid and state='sending' returning id`,
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
