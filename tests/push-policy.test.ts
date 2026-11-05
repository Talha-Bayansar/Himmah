import test from "node:test";
import assert from "node:assert/strict";
import { pushPolicy } from "../src/notifications/push-policy.ts";
const now = Date.parse("2026-11-05T12:00:00Z");
const base = {
  kind: "session_changed",
  timezone: "Europe/Brussels",
  plannedAt: "2026-11-05T16:00:00Z",
  createdAt: "2026-11-05T11:59:00Z",
};
test("push policy debounces edits, limits interruptions and preserves imminent cancellation", () => {
  assert.deepEqual(pushPolicy(base, now), { action: "defer", delay: 60 });
  assert.equal(
    pushPolicy({ ...base, createdAt: "2026-11-05T11:00Z" }, now).action,
    "send",
  );
  assert.equal(
    pushPolicy({ ...base, kind: "session_reminder", recentChange: true }, now)
      .action,
    "skip",
  );
  assert.equal(
    pushPolicy({ ...base, latestPushAt: "2026-11-05T11:59Z" }, now).delay,
    240,
  );
  assert.equal(
    pushPolicy({ ...base, plannedAt: "2026-12-01T12:00Z" }, now).action,
    "skip",
  );
  assert.equal(
    pushPolicy({ ...base, plannedAt: "2026-11-05T11:00Z" }, now).action,
    "skip",
  );
  const night = Date.parse("2026-11-05T22:00Z");
  assert.equal(
    pushPolicy(
      { ...base, kind: "session_reminder", plannedAt: "2026-11-05T23:00Z" },
      night,
    ).action,
    "skip",
  );
  assert.equal(
    pushPolicy(
      { ...base, kind: "session_cancelled", plannedAt: "2026-11-05T23:00Z" },
      night,
    ).action,
    "send",
  );
  assert.equal(
    pushPolicy(
      { ...base, kind: "session_cancelled", plannedAt: "2026-11-06T12:00Z" },
      night,
    ).action,
    "defer",
  );
});

test("native queue claims one delivery per device and quiet deferrals preserve transport retries", async () => {
  const { exportsFixture } = await import("./exports-fixture.ts");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const { createNotificationStore } =
    await import("../src/server/notification-store.ts");
  const f = await exportsFixture();
  try {
    const dialect = new PgDialect();
    const store = createNotificationStore("", async (s) => {
      const q = dialect.sqlToQuery(s);
      return (await f.db.query(q.sql, q.params)).rows as Record<
        string,
        unknown
      >[];
    });
    await f.db.query(
      "insert into hub_push_devices(user_id,endpoint,p256dh,auth,locale)values('owner','https://fcm.googleapis.com/policy','key','auth','en')",
    );
    for (let i = 0; i < 2; i++)
      await f.db.query(
        "insert into hub_notifications(organization_id,user_id,event_id,kind,href)values($1,'owner',gen_random_uuid(),'staff_notice','/hub')",
        [f.org],
      );
    const jobs = await store.claim();
    assert.equal(jobs.length, 1);
    assert.equal((await store.claim()).length, 0);
    const job = jobs[0]!;
    await store.defer(String(job.id), String(job.lease), 600);
    const saved = (
      await f.db.query<{ attempts: number; state: string }>(
        "select attempts,state from hub_push_deliveries where id=$1",
        [job.id],
      )
    ).rows[0]!;
    assert.equal(saved.attempts, 0);
    assert.equal(saved.state, "pending");
    const second = (await store.claim())[0]!;
    await store.finish(String(second.id), String(second.lease), "sent", 0);
    await f.db.query(
      "update hub_push_deliveries set next_at=now()-interval '1 second' where id=$1",
      [job.id],
    );
    const again = (await store.claim())[0]!;
    const target = (
      await store.target(String(again.id), String(again.lease))
    )[0]!;
    assert.ok(target.latestPushAt);
    assert.equal(pushPolicy(target).action, "defer");
    await store.finish(String(again.id), String(again.lease), "dead", 0);
    await f.db.query(
      "insert into hub_notifications(organization_id,user_id,event_id,kind,href)values($1,'owner',gen_random_uuid(),'staff_notice','/hub')",
      [f.org],
    );
    const upcoming = crypto.randomUUID();
    await f.db.query(
      "insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Upcoming','','','Europe/Brussels',now()+interval '1 hour',now()+interval '2 hours','owner',gen_random_uuid())",
      [upcoming, f.org, f.activity],
    );
    await f.db.query(
      "insert into hub_session_follows(organization_id,user_id,activity_id,session_id,enabled,reminder_minutes)values($1,'owner',$2,$3,true,0)",
      [f.org, f.activity, upcoming],
    );
    await f.db.query(
      "update hub_activity_sessions set location='Other room',version=version+1 where id=$1",
      [upcoming],
    );
    await f.db.query(
      "update hub_activity_sessions set cancelled=true,version=version+1 where id=$1",
      [upcoming],
    );
    const urgent = (await store.claim())[0]!;
    const urgentTarget = (
      await store.target(String(urgent.id), String(urgent.lease))
    )[0]!;
    assert.equal(
      urgentTarget.kind,
      "session_cancelled",
      "Imminent cancellation takes priority over old routine/stale notices",
    );
  } finally {
    await f.db.close();
  }
});
