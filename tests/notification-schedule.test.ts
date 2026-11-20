import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { exportsFixture } from "./exports-fixture.ts";
import { createNotificationScheduleStore } from "../src/server/notification-schedule-store.ts";
import { createNotificationStore } from "../src/server/notification-store.ts";
import { createSessionFollowStore } from "../src/server/session-follow-store.ts";

test("authoritative next alarm follows opt-in, session changes, mute/cancellation, start eligibility and pending leases", async () => {
  const f = await exportsFixture();
  try {
    const dialect = new PgDialect(),
      run = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await f.db.query<any>(q.sql, q.params)).rows;
      };
    const clock = createNotificationScheduleStore("", run),
      follows = createSessionFollowStore("", run);
    assert.equal(await clock.next(false), null);
    const session = crypto.randomUUID();
    await f.db.query(
      `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Future','','','UTC','2099-01-01T12:00:00Z','2099-01-01T13:00:00Z','owner',gen_random_uuid())`,
      [session, f.org, f.activity],
    );
    await f.db.query(
      `insert into hub_session_follows(organization_id,user_id,activity_id,enabled,reminder_minutes)values($1,'owner',$2,true,60)`,
      [f.org, f.activity],
    );
    assert.equal(await clock.next(false), Date.parse("2099-01-01T11:00:00Z"));
    await f.db.query(
      `update hub_activity_sessions set starts_at='2099-02-01T12:00:00Z',ends_at='2099-02-01T13:00:00Z' where id=$1`,
      [session],
    );
    assert.equal(await clock.next(false), Date.parse("2099-02-01T11:00:00Z"));
    await f.db.query(
      `insert into hub_session_follows(organization_id,user_id,activity_id,session_id,enabled,reminder_minutes)values($1,'owner',$2,$3,false,60)`,
      [f.org, f.activity, session],
    );
    assert.equal(await clock.next(false), null);
    await f.db.query(
      `update hub_session_follows set enabled=true where session_id=$1`,
      [session],
    );
    await f.db.query(
      `update hub_activity_sessions set cancelled=true where id=$1`,
      [session],
    );
    assert.equal(await clock.next(false), null);
    await f.db.query(
      `update hub_activity_sessions set cancelled=false,starts_at=now()+interval '30 minutes',ends_at=now()+interval '90 minutes' where id=$1`,
      [session],
    );
    const now = Date.now();
    assert.ok(
      (await clock.next(false))! <= Date.now() &&
        (await clock.next(false))! >= now - 5000,
    );
    await follows.generate();
    const start = Number(
      (
        await f.db.query<any>(
          `select extract(epoch from starts_at)*1000 as at from hub_activity_sessions where id=$1`,
          [session],
        )
      ).rows[0].at,
    );
    assert.equal(await clock.next(false), start);
    await f.db.query(
      `insert into hub_attendance(organization_id,activity_id,session_id,person_id,status)values($1,$2,$3,$4,'present')`,
      [f.org, f.activity, session, f.contacts[0]],
    );
    assert.equal(await clock.next(false), null);
    // Fake devices/deliveries are local only; no push transport is called.
    await f.db.query(
      `insert into hub_push_devices(user_id,endpoint,p256dh,auth,locale)values('owner','https://fcm.googleapis.com/fake-clock','fake','fake','en')`,
    );
    await f.db.query(
      `insert into hub_notifications(organization_id,user_id,event_id,kind,href)values($1::uuid,'owner',gen_random_uuid(),'staff_notice','/workspace/'||$1::text||'/notifications')`,
      [f.org],
    );
    const next = await clock.next(true);
    assert.ok(next! <= Date.now());
    await f.db.query(
      `update hub_push_deliveries set next_at=now()+interval '20 minutes' where state='pending'`,
    );
    assert.equal(
      await clock.next(true),
      Number(
        (
          await f.db.query<any>(
            `select extract(epoch from next_at)*1000 as at from hub_push_deliveries where state='pending'`,
          )
        ).rows[0].at,
      ),
    );
    await f.db.query(
      `update hub_push_deliveries set state='sending',next_at=now()+interval '4 minutes',lease=gen_random_uuid()`,
    );
    await f.db.query(
      `insert into hub_notifications(organization_id,user_id,event_id,kind,href)values($1::uuid,'owner',gen_random_uuid(),'staff_notice','/workspace/'||$1::text||'/notifications')`,
      [f.org],
    );
    const leased = Number(
      (
        await f.db.query<any>(
          `select extract(epoch from next_at)*1000 as at from hub_push_deliveries where state='sending'`,
        )
      ).rows[0].at,
    );
    assert.equal(await clock.next(true), leased);
    await f.db.query(`update hub_notifications set read_at=now()`);
    assert.equal(await clock.next(true), null);
    assert.equal(await clock.next(false, false), null);
    const delivery = createNotificationStore("", run);
    for (let i = 0; i < 12; i++) {
      const user = "staff-" + i;
      await f.db.query(
        `insert into hub_memberships(organization_id,user_id,role)values($1,$2,'admin')`,
        [f.org, user],
      );
      await f.db.query(
        `insert into hub_push_devices(user_id,endpoint,p256dh,auth,locale)values($1,$2,'fake','fake','en')`,
        [user, "https://fcm.googleapis.com/fake-batch-" + i],
      );
      await f.db.query(
        `insert into hub_notifications(organization_id,user_id,event_id,kind,href)values($1,$2,gen_random_uuid(),'staff_notice','/notifications')`,
        [f.org, user],
      );
    }
    const batch = await delivery.claim();
    assert.equal(batch.length, 10);
    assert.ok((await clock.next(true))! <= Date.now());
    for (const job of batch)
      await delivery.finish(String(job.id), String(job.lease), "dead", 0);
    const rest = await delivery.claim();
    assert.equal(rest.length, 2);
    for (const job of rest)
      await delivery.finish(String(job.id), String(job.lease), "dead", 0);
    assert.equal(await clock.next(true), null);
  } finally {
    await f.db.close();
  }
});
