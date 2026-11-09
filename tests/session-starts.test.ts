import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createNotificationStore } from "../src/server/notification-store.ts";
import { pushPolicy } from "../src/notifications/push-policy.ts";
import { pageInput } from "../src/community/contracts.ts";

test("start reminders are opted-in, scoped, once per plan, useful only while attendance has not begun", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const key = () => crypto.randomUUID(),
      org = key(),
      activity = key(),
      session = key(),
      contact = key();
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Start tests','start-tests','UTC','owner',gen_random_uuid())`,
      [org],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner'),($1,'helper','volunteer'),($1,'cash','volunteer'),($1,'changes','admin'),($1,'off','admin')`,
      [org],
    );
    await db.query(
      `insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key)values($1,$2,'Session','','','UTC','owner',gen_random_uuid())`,
      [activity, org],
    );
    await db.query(
      `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Session','','','UTC',now()-interval '1 minute',now()+interval '1 hour','owner',gen_random_uuid())`,
      [session, org, activity],
    );
    await db.query(
      `insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,'Attendee','owner','owner')`,
      [contact, org],
    );
    await db.query(
      `insert into hub_volunteer_assignments(organization_id,user_id,staff_name,activity_id,scope_name,can_attend,can_collect,created_by,creation_key)values($1,'helper','Helper',$2,'Session',true,false,'owner',gen_random_uuid()),($1,'cash','Cash',$2,'Session',false,true,'owner',gen_random_uuid())`,
      [org, activity],
    );
    await db.query(
      `insert into hub_session_follows(organization_id,user_id,activity_id,enabled,reminder_minutes)values($1,'owner',$2,true,60),($1,'helper',$2,true,60),($1,'cash',$2,true,60),($1,'changes',$2,true,0),($1,'off',$2,false,60)`,
      [org, activity],
    );
    const count = async () =>
      Number(
        (await db.query<any>(`select hub_generate_session_starts() as n`))
          .rows[0].n,
      );
    assert.equal(await count(), 2);
    assert.equal(await count(), 0);
    const all = (
      await db.query<any>(
        `select * from hub_notifications where kind='session_started' order by user_id`,
      )
    ).rows;
    assert.deepEqual(
      all.map((n) => n.user_id),
      ["helper", "owner"],
    );
    assert.ok(all.every((n) => n.href.endsWith("/attendance")));
    const dialect = new PgDialect(),
      store = createNotificationStore("", async (s) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<any>(q.sql, q.params)).rows;
      });
    const list = await store.list(
      "owner",
      org,
      pageInput(new URL("https://test"), "notices"),
    );
    assert.equal(list.length, 1);
    assert.equal(list[0]!.kind, "session_started");
    // Fake device only: no transport is invoked.
    await db.query(
      `insert into hub_push_devices(user_id,endpoint,p256dh,auth,locale)values('owner','https://fcm.googleapis.com/fake-starts','fake','fake','en')`,
    );
    // Devices registered after creation do not retroactively receive old notices; explicitly test a queued synthetic delivery.
    await db.query(
      `insert into hub_push_deliveries(notification_id,device_id)select n.id,d.id from hub_notifications n cross join hub_push_devices d where n.user_id='owner' and n.kind='session_started'`,
    );
    const jobs = await store.claim();
    assert.equal(jobs.length, 1);
    const target = (
      await store.target(String(jobs[0]!.id), String(jobs[0]!.lease))
    )[0]!;
    assert.ok(Number(target.ttl) > 0 && Number(target.ttl) <= 900);
    assert.ok(Date.parse(String(target.expiresAt)) > Date.now());
    await db.query(
      `insert into hub_attendance(organization_id,activity_id,session_id,person_id,status)values($1,$2,$3,$4,'present')`,
      [org, activity, session, contact],
    );
    assert.equal(
      (
        await store.list(
          "owner",
          org,
          pageInput(new URL("https://test"), "notices"),
        )
      ).length,
      0,
    );
    assert.equal(
      (await store.target(String(jobs[0]!.id), String(jobs[0]!.lease))).length,
      0,
    );
    assert.equal(await count(), 0);
    // A stopped/late job must never backfill a day of old session alerts.
    await db.query(
      `update hub_activity_sessions set starts_at=now()-interval '16 minutes' where id=$1`,
      [session],
    );
    assert.equal(await count(), 0);
    await db.query(
      `update hub_activity_sessions set starts_at=now()+interval '1 minute' where id=$1`,
      [session],
    );
    assert.equal(await count(), 0);
  } finally {
    await db.close();
  }
});
test("start pushes respect expiry, quiet hours and cooldown without treating past starts as already-expired pre-session reminders", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const t = {
    kind: "session_started",
    plannedAt: "2026-11-09T11:59:00Z",
    expiresAt: "2026-11-09T12:14:00Z",
    createdAt: "2026-11-09T12:00:00Z",
    timezone: "UTC",
  };
  assert.equal(pushPolicy(t, now).action, "send");
  assert.deepEqual(
    pushPolicy({ ...t, latestPushAt: "2026-11-09T11:59:00Z" }, now),
    { action: "defer", delay: 240 },
  );
  assert.equal(
    pushPolicy(
      {
        ...t,
        expiresAt: "2026-11-09T12:02:00Z",
        latestPushAt: "2026-11-09T11:59:00Z",
      },
      now,
    ).action,
    "skip",
  );
  assert.equal(
    pushPolicy({ ...t, quietStart: 660, quietEnd: 780 }, now).action,
    "skip",
  );
  assert.equal(
    pushPolicy(
      { ...t, quietStart: 660, quietEnd: 780, quietEnabled: false },
      now,
    ).action,
    "send",
  );
  assert.equal(
    pushPolicy({ ...t, expiresAt: "2026-11-09T12:00:00Z" }, now).action,
    "skip",
  );
  assert.equal(
    pushPolicy({ ...t, plannedAt: "2026-11-09T12:01:00Z" }, now).action,
    "skip",
  );
});

test("additive start/order plan checks its baseline, preserves every existing row and creates no notifications", async () => {
  const { sessionStartsPlan } =
    await import("../scripts/session-starts-plan.mjs");
  const { organizationSettingsPlan } =
    await import("../scripts/organization-settings-plan.mjs");
  const db = new PGlite();
  try {
    await installDatabase(db, { sessionStarts: false });
    const plan = await sessionStartsPlan();
    const local = plan.statements.map((s) =>
      s.replace(
        "current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR ",
        "",
      ),
    );
    await assert.rejects(
      () => db.exec("BEGIN;" + local.join("\n") + "COMMIT;"),
      /baseline mismatch/,
    );
    await db.exec("ROLLBACK");
    const baseline = (await organizationSettingsPlan()).digest;
    await db.exec(
      `comment on function hub_save_organization_settings(text,uuid,uuid,jsonb) is 'himmah-organization-settings-sha256:${baseline}'`,
    );
    await db.exec(
      `insert into hub_organizations(name,slug,timezone,created_by,creation_key)values('Preserved','preserved','UTC','owner',gen_random_uuid())`,
    );
    await db.exec("BEGIN;" + local.join("\n") + "COMMIT;");
    assert.equal(
      (await db.query<any>(`select count(*)::int n from hub_notifications`))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          `select count(*)::int n from hub_organizations where name='Preserved'`,
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query<any>(
          `select obj_description('hub_generate_session_starts()'::regprocedure,'pg_proc') receipt`,
        )
      ).rows[0].receipt,
      "himmah-session-starts-sha256:" + plan.digest,
    );
    await assert.rejects(
      () => db.exec("BEGIN;" + local.join("\n") + "COMMIT;"),
      /baseline mismatch/,
    );
    await db.exec("ROLLBACK");
  } finally {
    await db.close();
  }
});
