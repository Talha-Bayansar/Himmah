import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { FollowCommand } from "../notifications/follow-contracts.ts";
export type SessionFollowStore = ReturnType<typeof createSessionFollowStore>;
export function createSessionFollowStore(
  url: string,
  execute?: (statement: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url)),
    rows = (statement: SQL) =>
      execute
        ? execute(statement)
        : db
            .execute(statement)
            .then((r) => r.rows as Record<string, unknown>[]);
  return {
    state: (
      user: string,
      org: string,
      activity: string,
      session: string | null,
    ) =>
      rows(
        sql`select case when state is null then null else state||jsonb_build_object('quietHours',jsonb_build_object('enabled',coalesce(q.quiet_enabled,true),'start',coalesce(q.quiet_start,1320),'end',coalesce(q.quiet_end,480),'timezone',o.timezone)) end result from (select hub_follow_state(${user},${org}::uuid,${activity}::uuid,${session}::uuid) state) f join hub_organizations o on o.id=${org}::uuid left join hub_organization_settings q on q.organization_id=o.id`,
      ),
    set: (
      user: string,
      org: string,
      activity: string,
      session: string | null,
      body: FollowCommand,
    ) =>
      rows(
        sql`select hub_set_follow(${user},${org}::uuid,${activity}::uuid,${session}::uuid,${body.key}::uuid,${JSON.stringify({ following: body.following, reminderMinutes: body.reminderMinutes, version: body.version })}::jsonb) as result`,
      ),
    generate: () =>
      rows(
        sql`select hub_generate_session_reminders()+hub_generate_session_starts() as count`,
      ),
  };
}
