import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";

/** Privileged job metadata only. Reuse current SQL visibility/opt-in; return no recipient data. */
export function nextNotificationWakeStatement(
  includePush: boolean,
  includeReminders = true,
) {
  return sql`with candidates as (
    select greatest(s.starts_at-interval '1 hour',now()) as due_at
    from hub_activity_sessions s join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id
    cross join lateral hub_effective_session_follows(s.organization_id,s.activity_id,s.id) f
    where ${includeReminders} and not s.cancelled and not a.cancelled and s.starts_at>now() and f.reminder_minutes=60
      and not exists(select 1 from hub_notifications n where n.organization_id=s.organization_id and n.user_id=f.user_id and n.session_id=s.id and n.planned_at=s.starts_at and n.kind='session_reminder')
    union all
    select greatest(s.starts_at,now()) from hub_activity_sessions s join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id
    cross join lateral hub_effective_session_follows(s.organization_id,s.activity_id,s.id) f
    where ${includeReminders} and not s.cancelled and not a.cancelled and s.starts_at>now()-interval '15 minutes' and s.ends_at>now() and f.reminder_minutes=60
      and hub_can_attend_session(f.user_id,s.organization_id,s.activity_id,s.id)
      and not exists(select 1 from hub_attendance done where done.organization_id=s.organization_id and done.session_id=s.id and done.status='present' and hub_can_attend_person(f.user_id,s.organization_id,s.activity_id,s.id,done.person_id))
      and not exists(select 1 from hub_notifications n where n.organization_id=s.organization_id and n.user_id=f.user_id and n.session_id=s.id and n.planned_at=s.starts_at and n.kind='session_started')
    union all
    select greatest(d.next_at,coalesce((select max(leased.next_at) from hub_push_deliveries leased where leased.device_id=d.device_id and leased.state='sending' and leased.next_at>now()),d.next_at))
    from hub_push_deliveries d join hub_notifications n on n.id=d.notification_id
    where ${includePush} and d.next_at<d.created_at+interval '24 hours' and d.state in ('pending','sending') and d.attempts<=5 and d.created_at>now()-interval '24 hours'
      and n.read_at is null and hub_notification_visible(n,n.user_id)
      and (n.kind='staff_notice' or (n.kind='session_started' and d.next_at<(select least(s.ends_at,s.starts_at+interval '15 minutes') from hub_activity_sessions s where s.organization_id=n.organization_id and s.id=n.session_id)) or (n.kind in ('session_reminder','session_changed','session_cancelled') and n.planned_at>d.next_at))
  ) select extract(epoch from min(due_at))*1000 as "nextAt" from candidates`;
}
export function createNotificationScheduleStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  return {
    async next(
      includePush: boolean,
      includeReminders = true,
    ): Promise<number | null> {
      const statement = nextNotificationWakeStatement(
        includePush,
        includeReminders,
      );
      const rows = execute
        ? await execute(statement)
        : (await db.execute(statement)).rows;
      const next = rows[0]?.nextAt;
      if (next === null || next === undefined) return null;
      const value = Number(next);
      if (!Number.isFinite(value))
        throw new Error("Invalid notification deadline");
      return value;
    },
  };
}
