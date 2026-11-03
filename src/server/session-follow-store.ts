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
        sql`select hub_follow_state(${user},${org}::uuid,${activity}::uuid,${session}::uuid) as result`,
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
    generate: () => rows(sql`select hub_generate_session_reminders() as count`),
  };
}
