import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { installDatabase } from "./database.ts";
import { createSessionFollowStore } from "../src/server/session-follow-store.ts";
import { createNotificationStore } from "../src/server/notification-store.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createStore } from "../src/server/store.ts";
import { sessionFollowApi } from "../src/server/session-follow-api.ts";
import {
  followInput,
  type FollowCommand,
  type FollowState,
} from "../src/notifications/follow-contracts.ts";
import { pageInput } from "../src/community/contracts.ts";
import { runNotificationJobs } from "../src/server/notification-jobs.ts";
const key = () => crypto.randomUUID();
test("following input is explicit, bounded and cannot select another actor", () => {
  const good = { key: key(), following: true, reminderMinutes: 60, version: 0 };
  assert.deepEqual(followInput(good), good);
  for (const patch of [
    { following: "true" },
    { reminderMinutes: "60" },
    { reminderMinutes: 30 },
    { version: -1 },
    { version: 1.5 },
    { version: 2147483647 },
    { userId: "other" },
    { key: "wrong" },
  ])
    assert.throws(() => followInput({ ...good, ...patch }));
});
test("session follow SQL/API: explicit opt-in, overrides, exact retries, scope, stale suppression and atomic events", async (t) => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect();
    const run = async (s: SQL) => {
      const q = dialect.sqlToQuery(s);
      return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
    };
    const follows = createSessionFollowStore("", run),
      notifications = createNotificationStore("", run),
      activities = createActivityStore("", run),
      organizations = createStore("", run),
      org = key(),
      other = key(),
      activity = key(),
      foreign = key(),
      session = key(),
      later = key();
    for (const [id, actor, slug] of [
      [org, "owner", "follows"],
      [other, "outsider", "foreign"],
    ]) {
      await db.query(
        "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Synthetic',$2,'Europe/Brussels',$3,gen_random_uuid())",
        [id, slug, actor],
      );
      await db.query(
        "insert into hub_memberships(organization_id,user_id,role)values($1,$2,'owner')",
        [id, actor],
      );
    }
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'helper','volunteer'),($1,'reader','volunteer')",
      [org],
    );
    for (const [id, oid] of [
      [activity, org],
      [foreign, other],
    ])
      await db.query(
        "insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key)values($1,$2,'Study','','Hall','Europe/Brussels','owner',gen_random_uuid())",
        [id, oid],
      );
    for (const [id, minutes] of [
      [session, 30],
      [later, 180],
    ])
      await db.query(
        "insert into hub_activity_sessions(id,organization_id,activity_id,name,topic,description,location,timezone,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Study','Patience','','Hall','Europe/Brussels',now()+$4*interval '1 minute',now()+($4+60)*interval '1 minute','owner',gen_random_uuid())",
        [id, org, activity, minutes],
      );
    const assignment = key();
    await db.query(
      "insert into hub_volunteer_assignments(id,organization_id,user_id,staff_name,activity_id,scope_name,can_attend,created_by,creation_key)values($1,$2,'helper','Helper',$3,'Study',true,'owner',gen_random_uuid())",
      [assignment, org, activity],
    );
    const state = async (user = "owner", sid: string | null = session) =>
      (await follows.state(user, org, activity, sid))[0]!
        .result as FollowState | null;
    const set = async (
      user: string,
      sid: string | null,
      following: boolean,
      reminderMinutes: 0 | 60 = 60,
      version?: number,
      requestKey = key(),
    ) => {
      const old = await state(user, sid);
      return (
        await follows.set(user, org, activity, sid, {
          key: requestKey,
          following,
          reminderMinutes,
          version: version ?? old?.version ?? 0,
        })
      )[0]!.result as FollowState & { code?: string };
    };
    const count = async (kind: string) =>
      Number(
        (
          await db.query<{ n: number }>(
            "select count(*)::int as n from hub_notifications where kind=$1",
            [kind],
          )
        ).rows[0]!.n,
      );
    const inbox = async (user = "owner") =>
      notifications.list(
        user,
        org,
        pageInput(new URL("https://test.invalid/?limit=50"), "test"),
      );
    await t.test(
      "reads never enroll, and no reminder exists until explicitly followed",
      async () => {
        assert.equal((await state())!.following, false);
        await follows.generate();
        assert.equal(await count("session_reminder"), 0);
        assert.equal(
          (await db.query("select * from hub_session_follows")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "activity inheritance and session override deduplicate reminders without a device",
      async () => {
        const first = await set("owner", null, true);
        assert.equal(first.version, 1);
        assert.equal((await state())!.source, "activity");
        await set("owner", session, true);
        assert.equal(Number((await follows.generate())[0]!.count), 1);
        assert.equal(Number((await follows.generate())[0]!.count), 0);
        assert.equal(await count("session_reminder"), 1);
        assert.equal(
          (await db.query("select * from hub_push_deliveries")).rows.length,
          0,
        );
        const row = (await inbox())[0]!;
        assert.equal(row.kind, "session_reminder");
        assert.equal(row.subject, "Patience");
        assert.equal(
          row.href,
          `/workspace/${org}/activities/${activity}/sessions/${session}/attendance`,
        );
      },
    );
    await t.test(
      "exact retries survive lost responses, conflicting payload/version never change preferences",
      async () => {
        const initial = (await state())!,
          requestKey = key(),
          body = {
            key: requestKey,
            following: false,
            reminderMinutes: 0 as const,
            version: initial.version,
          };
        const first = (
          await follows.set("owner", org, activity, session, body)
        )[0]!.result;
        assert.deepEqual(
          (await follows.set("owner", org, activity, session, body))[0]!.result,
          first,
        );
        assert.equal(
          (
            (
              await follows.set("owner", org, activity, session, {
                ...body,
                following: true,
              })
            )[0]!.result as any
          ).code,
          "request_key_conflict",
        );
        assert.equal(
          (await set("owner", session, true, 60, 0)).code,
          "version_conflict",
        );
        assert.equal((await state())!.following, false);
        assert.equal((await inbox()).length, 0);
        assert.equal(
          Number((await follows.generate())[0]!.count),
          0,
          "session mute suppresses activity reminder",
        );
      },
    );
    await t.test(
      "current permission precedes reading, writes and even exact receipt replay",
      async () => {
        assert.equal(await state("reader"), null);
        const b: FollowCommand = {
          key: key(),
          following: true,
          reminderMinutes: 60,
          version: 0,
        };
        await follows.set("helper", org, activity, session, b);
        await db.query(
          "update hub_volunteer_assignments set revoked_at=now(),revoked_by='owner',revoke_reason='Changed' where id=$1",
          [assignment],
        );
        assert.equal(await state("helper"), null);
        assert.equal(
          (
            (await follows.set("helper", org, activity, session, b))[0]!
              .result as any
          ).code,
          "not_found",
        );
        assert.equal((await inbox("helper")).length, 0);
        assert.equal(
          (await follows.state("owner", org, foreign, session))[0]!.result,
          null,
        );
      },
    );
    await t.test(
      "schedule edits enqueue once transactionally; only latest relevant state stays actionable",
      async () => {
        await set("owner", session, true);
        await db.query(
          "update hub_activity_sessions set starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 where id=$1",
          [session],
        );
        assert.equal(await count("session_changed"), 1);
        assert.equal(
          (await inbox()).filter((r) => r.kind === "session_reminder").length,
          0,
          "old reminder hides after reschedule",
        );
        await follows.generate();
        assert.equal(await count("session_reminder"), 2);
        await db.query(
          "update hub_activity_sessions set location='Other room',version=version+1 where id=$1",
          [session],
        );
        assert.equal(await count("session_changed"), 2);
        assert.equal(
          (await inbox()).filter((r) => r.kind === "session_changed").length,
          1,
          "older edit suppressed",
        );
        // Non-schedule row versions do not invent schedule events or stale the last event.
        await db.query(
          "update hub_activity_sessions set price_minor=100,version=version+1 where id=$1",
          [session],
        );
        assert.equal(await count("session_changed"), 2);
        assert.equal(
          (await inbox()).filter((r) => r.kind === "session_changed").length,
          1,
        );
      },
    );
    await t.test(
      "delivery rechecks current follow, lease, scope, schedule and per-session expiry",
      async () => {
        await db.query(
          "insert into hub_push_devices(user_id,endpoint,p256dh,auth,locale)values('owner','https://fcm.googleapis.com/synthetic','key','auth','en')",
        );
        await db.query(
          "update hub_activity_sessions set location='Final room',version=version+1 where id=$1",
          [session],
        );
        const jobs = await notifications.claim();
        assert.ok(jobs.length > 0);
        const job = jobs[0]!;
        const target = (
          await notifications.target(String(job.id), String(job.lease))
        )[0]!;
        assert.ok(target);
        assert.ok(Number(target.ttl) > 0 && Number(target.ttl) <= 3600);
        assert.equal(
          target.href,
          `/workspace/${org}/activities/${activity}/sessions/${session}/attendance`,
        );
        await set("owner", session, false);
        assert.equal(
          (await notifications.target(String(job.id), String(job.lease)))
            .length,
          0,
        );
        await set("owner", session, true);
        assert.equal(
          (await notifications.target(String(job.id), String(job.lease)))
            .length,
          0,
          "re-follow cannot revive an old epoch",
        );
      },
    );
    await t.test(
      "cancelled, archived and already-started sessions never get a reminder or stale push",
      async () => {
        await db.query(
          "update hub_activity_sessions set cancelled=true,cancellation_reason='Cancelled',version=version+1 where id=$1",
          [session],
        );
        assert.equal(await count("session_cancelled"), 1);
        assert.equal(
          (await inbox()).filter((r) => r.kind === "session_reminder").length,
          0,
        );
        assert.equal(Number((await follows.generate())[0]!.count), 0);
        assert.equal((await set("owner", session, true)).code, "follow_closed");
        await set("owner", session, false);
        assert.equal((await state())!.following, false);
        await db.query(
          "update hub_activity_sessions set starts_at=now()-interval '30 minutes',ends_at=now()+interval '30 minutes' where id=$1",
          [later],
        );
        await follows.generate();
        assert.equal(
          (await inbox()).filter((r) => r.kind === "session_reminder").length,
          0,
        );
        await db.query("update hub_activities set cancelled=true where id=$1", [
          activity,
        ]);
        assert.equal((await inbox()).length, 0);
      },
    );
    await t.test(
      "API verification/body/tenant enforcement and no-store response",
      async () => {
        const url = `https://himmah.test/api/organizations/${org}/activities/${activity}/follow`;
        const api = (actor: string, body?: unknown, verified = true) =>
          sessionFollowApi(
            new Request(url, {
              ...(body === undefined
                ? {}
                : {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  }),
            }),
            { id: actor, emailVerified: verified },
            organizations,
            follows,
          );
        assert.equal((await api("owner", undefined, false))!.status, 403);
        assert.equal((await api("outsider"))!.status, 404);
        assert.equal(
          (await api("owner", {
            key: key(),
            following: true,
            reminderMinutes: 60,
            version: 0,
            userId: "helper",
          }))!.status,
          400,
        );
        assert.equal(
          (await api("owner"))!.headers.get("Cache-Control"),
          "no-store",
        );
      },
    );
    await t.test(
      "permanent activity deletion removes follows/receipts/notices while retaining unrelated targets",
      async () => {
        const preview = (
          await activities.deletionPreview("owner", org, activity)
        )[0]!.result as any;
        const result = (
          await activities.deleteActivity(
            "owner",
            org,
            activity,
            key(),
            preview.snapshot,
          )
        )[0]!.result as any;
        assert.equal(result.deleted, true);
        assert.equal(
          (
            await db.query(
              "select * from hub_session_follows where activity_id=$1",
              [activity],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select * from hub_follow_requests where activity_id=$1",
              [activity],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select * from hub_notifications where activity_id=$1",
              [activity],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query("select * from hub_activities where id=$1", [
              foreign,
            ])
          ).rows.length,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});
test("scheduled notification jobs retain existing delivery, gates and bounded generation failures", async () => {
  const calls: string[] = [],
    env = {
      HIMMAH_DATABASE_URL: "local",
      HIMMAH_APP_ORIGIN: "https://himmah.test",
      HIMMAH_PEOPLE_ENABLED: "true",
    };
  await runNotificationJobs(env, {
    generate: async () => {
      calls.push("generate");
    },
    deliver: async () => {
      calls.push("deliver");
    },
  });
  assert.deepEqual(calls, ["generate", "deliver"]);
  calls.length = 0;
  await runNotificationJobs(
    { ...env, HIMMAH_MAINTENANCE: "true" },
    {
      generate: async () => {
        calls.push("bad");
      },
      deliver: async () => {
        calls.push("bad");
      },
    },
  );
  assert.equal(calls.length, 0);
  await runNotificationJobs(
    { ...env, HIMMAH_PEOPLE_ENABLED: "false" },
    {
      generate: async () => {
        calls.push("bad");
      },
      deliver: async () => {
        calls.push("deliver");
      },
    },
  );
  assert.deepEqual(calls, ["deliver"]);
});

test("follow routes preserve Worker authentication, JSON origin and feature gates", async () => {
  const { createHandler } = await import("../src/server/worker.ts");
  let verified = true,
    signed = true,
    writes = 0;
  const org = key(),
    activity = key();
  const env = {
    HIMMAH_DATABASE_URL: "unused-fixture",
    HIMMAH_AUTH_URL: "https://auth.invalid",
    HIMMAH_APP_ORIGIN: "https://himmah.test",
    HIMMAH_PEOPLE_ENABLED: "true",
    ASSETS: { fetch: async () => new Response("asset") },
    ONBOARDING_LIMITER: { limit: async () => ({ success: true }) },
    DIRECTORY_LIMITER: { limit: async () => ({ success: true }) },
  };
  const handler = createHandler({
    fetch: async () =>
      Response.json(
        signed
          ? { user: { id: "owner", emailVerified: verified } }
          : { user: null },
      ),
    store: () => ({ get: async () => ({ id: org }) }) as never,
    sessionFollows: () =>
      ({
        state: async () => [{ result: { following: false } }],
        set: async () => {
          writes++;
          return [{ result: { following: true } }];
        },
      }) as never,
  });
  const request = (
    method = "GET",
    origin = "https://himmah.test",
    contentType = "application/json",
  ) =>
    new Request(
      `https://himmah.test/api/organizations/${org}/activities/${activity}/follow`,
      {
        method,
        headers: {
          cookie: "session=fixture",
          origin,
          "content-type": contentType,
        },
        ...(method === "POST"
          ? {
              body: JSON.stringify({
                key: key(),
                following: true,
                reminderMinutes: 60,
                version: 0,
              }),
            }
          : {}),
      },
    );
  assert.equal((await handler(request(), env)).status, 200);
  assert.equal(
    (await handler(request(), { ...env, HIMMAH_PEOPLE_ENABLED: "false" }))
      .status,
    503,
  );
  assert.equal(
    (await handler(request("POST", "https://other.invalid"), env)).status,
    403,
  );
  assert.equal(
    (await handler(request("POST", "https://himmah.test", "text/plain"), env))
      .status,
    415,
  );
  verified = false;
  assert.equal((await handler(request("POST"), env)).status, 403);
  signed = false;
  assert.equal((await handler(request("POST"), env)).status, 401);
  assert.equal(writes, 0);
  signed = true;
  verified = true;
  assert.equal((await handler(request("POST"), env)).status, 200);
  assert.equal(writes, 1);
});

test("additive upgrade preserves existing rows and creates no personal follows or notices", async () => {
  const { sessionFollowingPlan } =
    await import("../scripts/session-following-plan.mjs");
  const db = new PGlite();
  try {
    await installDatabase(db, { sessionFollowing: false });
    const org = key(),
      activity = key(),
      session = key();
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Synthetic','upgrade','Europe/Brussels','owner',gen_random_uuid())",
      [org],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')",
      [org],
    );
    await db.query(
      "insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key)values($1,$2,'Study','','Hall','Europe/Brussels','owner',gen_random_uuid())",
      [activity, org],
    );
    await db.query(
      "insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Study','','Hall','Europe/Brussels',now()+interval '30 minutes',now()+interval '90 minutes','owner',gen_random_uuid())",
      [session, org, activity],
    );
    await db.query(
      "insert into hub_notifications(organization_id,user_id,event_id,kind,href)values($1,'owner',gen_random_uuid(),'staff_notice','/hub')",
      [org],
    );
    const before = (
      await db.query("select to_jsonb(s) value from hub_activity_sessions s")
    ).rows;
    const plan = await sessionFollowingPlan();
    await db.exec("BEGIN");
    // The PGlite database/role differ; hosted validation runs the complete target guard.
    for (const sql of plan.statements.slice(1)) await db.exec(sql);
    await db.exec("COMMIT");
    assert.deepEqual(
      (await db.query("select to_jsonb(s) value from hub_activity_sessions s"))
        .rows,
      before,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from hub_session_follows",
        )
      ).rows[0]!.n,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from hub_follow_requests",
        )
      ).rows[0]!.n,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select hub_generate_session_reminders() n",
        )
      ).rows[0]!.n,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from hub_notifications",
        )
      ).rows[0]!.n,
      1,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from hub_push_deliveries",
        )
      ).rows[0]!.n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("reminder batches make progress and schedule events roll back with their mutation", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const org = key(),
      activity = key();
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Synthetic','batch','Europe/Brussels','owner',gen_random_uuid())",
      [org],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')",
      [org],
    );
    await db.query(
      "insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key)values($1,$2,'Study','','Hall','Europe/Brussels','owner',gen_random_uuid())",
      [activity, org],
    );
    await db.query(
      "insert into hub_activity_sessions(organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key) select $1,$2,'Study','','Hall','Europe/Brussels',now()+interval '30 minutes',now()+interval '90 minutes','owner',gen_random_uuid() from generate_series(1,101)",
      [org, activity],
    );
    await db.query(
      'select hub_set_follow(\'owner\',$1,$2,null,gen_random_uuid(),\'{"following":true,"reminderMinutes":60,"version":0}\')',
      [org, activity],
    );
    const generate = async () =>
      (
        await db.query<{ n: number }>(
          "select hub_generate_session_reminders() n",
        )
      ).rows[0]!.n;
    assert.equal(await generate(), 100);
    assert.equal(await generate(), 1);
    assert.equal(await generate(), 0);
    const id = (
      await db.query<{ id: string }>(
        "select id from hub_activity_sessions limit 1",
      )
    ).rows[0]!.id;
    const fingerprint = async () =>
      (
        await db.query<{ f: string }>(
          "select hub_session_notice_fingerprint(s) f from hub_activity_sessions s where id=$1",
          [id],
        )
      ).rows[0]!.f;
    const utc = await fingerprint();
    await db.exec("set timezone='Europe/Brussels'");
    assert.equal(
      await fingerprint(),
      utc,
      "fingerprint is independent of database timezone",
    );
    await db.exec("BEGIN");
    await db.query(
      "update hub_activity_sessions set location='Another room' where id=$1",
      [id],
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from hub_notifications where kind='session_changed'",
        )
      ).rows[0]!.n,
      1,
    );
    await db.exec("ROLLBACK");
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from hub_notifications where kind='session_changed'",
        )
      ).rows[0]!.n,
      0,
    );
    assert.equal(await fingerprint(), utc);
  } finally {
    await db.close();
  }
});
