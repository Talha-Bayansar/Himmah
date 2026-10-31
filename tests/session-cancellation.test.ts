import test from "node:test";
import { createHandler, type Env } from "../src/server/worker.ts";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createStore } from "../src/server/store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { activityApi } from "../src/server/activity-api.ts";
import { cancellationTotals } from "../src/activities/cancellation.ts";

test("reviewed one/future cancellation is atomic, scoped, replay-safe and retains participation and money", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      key = () => crypto.randomUUID();
    const run = async (s: any) => {
      const q = dialect.sqlToQuery(s);
      return (await db.query<any>(q.sql, q.params)).rows;
    };
    const org = key(),
      foreign = key(),
      activity = key(),
      other = key(),
      series = key(),
      person = key();
    for (const [id, slug, user] of [
      [org, "cancel-series", "owner"],
      [foreign, "other-cancel", "other"],
    ]) {
      await db.query(
        "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Community',$2,'UTC',$3,gen_random_uuid())",
        [id, slug, user],
      );
      await db.query(
        "insert into hub_memberships(organization_id,user_id,role)values($1,$2,'owner')",
        [id, user],
      );
    }
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'admin','admin'),($1,'helper','volunteer')",
      [org],
    );
    for (const [id, o] of [
      [activity, org],
      [other, foreign],
    ])
      await db.query(
        "insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key)values($1,$2,'Sohbet','','Hall','UTC','owner',gen_random_uuid())",
        [id, o],
      );
    const ids = Array.from({ length: 6 }, key),
      standalone = key();
    for (let i = 0; i < 6; i++)
      await db.query(
        "insert into hub_activity_sessions(id,organization_id,activity_id,series_id,series_position,name,topic,description,location,timezone,starts_at,ends_at,cancelled,price_minor,created_by,creation_key)values($1,$2,$3,$4,$5,'Sohbet',$6,'','Hall','UTC',case when $5=0 then now()-interval '1 day' when $5=3 then now()+interval '10 minutes' else timestamptz '2099-02-01 18:00Z'+$5*interval '7 days' end,case when $5=0 then now()-interval '23 hours' when $5=3 then now()+interval '70 minutes' else timestamptz '2099-02-01 19:00Z'+$5*interval '7 days' end,$5=1,1000,'owner',gen_random_uuid())",
        [ids[i], org, activity, series, i, i === 2 ? "Patience" : ""],
      );
    await db.query(
      "insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Standalone','','Hall','UTC','2099-03-10 18:00Z','2099-03-10 19:00Z','owner',gen_random_uuid())",
      [standalone, org, activity],
    );
    await db.query(
      "insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,'Synthetic person','owner','owner')",
      [person, org],
    );
    await db.query(
      "insert into hub_attendance(organization_id,activity_id,session_id,person_id,status,version)values($1,$2,$3,$4,'present',1),($1,$2,$5,$4,'present',1)",
      [org, activity, ids[0], person, ids[2]],
    );
    await db.query(
      "insert into hub_session_registration_settings(organization_id,activity_id,session_id,mode,version)values($1,$2,$3,'required',1)",
      [org, activity, ids[3]],
    );
    const charge = key(),
      charge2 = key(),
      receipt = key(),
      receipt2 = key(),
      receipt3 = key();
    for (const [id, session] of [
      [charge, ids[2]],
      [charge2, ids[4]],
    ])
      await db.query(
        "insert into hub_registration_charges(id,organization_id,activity_id,session_id,person_id,amount_minor,source,created_by)values($1,$2,$3,$4,$5,1000,'walk_in','owner')",
        [id, org, activity, session, person],
      );
    for (const [id, session, amount] of [
      [receipt, ids[2], 700],
      [receipt2, ids[4], 300],
      [receipt3, ids[5], 200],
    ])
      await db.query(
        "insert into hub_cash_receipts(id,organization_id,activity_id,session_id,amount_minor,occurred_at,created_by)values($1,$2,$3,$4,$5,now(),'owner')",
        [id, org, activity, session, amount],
      );
    await db.query(
      "insert into hub_cash_allocations(organization_id,receipt_id,charge_id,amount_minor)values($1,$2,$3,500),($1,$4,$5,300)",
      [org, receipt, charge, receipt2, charge2],
    );
    const store = createActivityStore("", run),
      organizations = createStore("", run);
    const preview = async (
      anchor = ids[2],
      scope = "future",
      actor = "owner",
    ) =>
      (
        await store.cancellationPreview(actor, org, activity, anchor!, scope)
      )[0]!.result as any;
    const command = async (p: any, request = key(), actor = "owner") =>
      (await store.cancelSessions(actor, org, activity, request, p))[0]!
        .result as any;
    const body = (p: any, anchor = ids[2], scope = "future") => ({
      mode: "cancel",
      anchor,
      scope,
      snapshot: p.snapshot,
      reason: "Building unavailable",
    });
    const beforeSessions = (
      await db.query<any>(
        "select id,to_jsonb(s) as row from hub_activity_sessions s",
      )
    ).rows;
    let p = await preview();
    assert.equal(p.items.length, 4);
    assert.deepEqual(
      new Set(p.items.map((r: any) => r.id)),
      new Set(ids.slice(2)),
    );
    assert.equal(cancellationTotals(p).collectedMinor, 1200);
    assert.equal((await preview(ids[0])).code, "conflict");
    assert.equal((await preview(ids[1])).code, "conflict");
    assert.equal((await preview(ids[2], "future", "helper")).code, "forbidden");
    assert.equal(
      (
        (
          await store.cancellationPreview(
            "other",
            org,
            activity,
            ids[2]!,
            "future",
          )
        )[0]!.result as any
      ).code,
      "forbidden",
    );
    assert.equal(
      (await command({ ...body(p), reason: "" })).code,
      "invalid_input",
    );
    assert.equal(
      (await command({ ...body(p), scope: "all" })).code,
      "invalid_input",
    );
    assert.equal(
      (await command({ ...body(p), snapshot: "bad" })).code,
      "invalid_input",
    );
    // Changed financial state cannot be accepted under the previous review.
    await db.query(
      "insert into hub_cash_allocation_corrections(organization_id,receipt_id,charge_id,request_key,reason,created_by)values($1,$2,$3,gen_random_uuid(),'unpaid','owner')",
      [org, receipt, charge],
    );
    assert.equal((await command(body(p))).code, "conflict");
    p = await preview();
    await db.query(
      "insert into hub_cash_reversals(organization_id,receipt_id,reason,created_by)values($1,$2,'Incorrect receipt','owner')",
      [org, receipt2],
    );
    assert.equal((await command(body(p))).code, "conflict");
    p = await preview();
    assert.equal(cancellationTotals(p).collectedMinor, 400);
    await db.query(
      "insert into hub_session_registrations(organization_id,activity_id,session_id,person_id,status,source)values($1,$2,$3,$4,'confirmed','advance')",
      [org, activity, ids[4], person],
    );
    assert.equal((await command(body(p))).code, "conflict");
    p = await preview();
    assert.equal(cancellationTotals(p).registrations, 1);
    await db.query(
      "update hub_activity_sessions set topic=$1,version=version+1 where id=$2",
      ["Gratitude", ids[4]],
    );
    assert.equal((await command(body(p))).code, "conflict");
    // Concurrent changes to the complete target set also require a new review.
    p = await preview();
    await db.query(
      "update hub_activity_sessions set cancelled=true,version=version+1 where id=$1",
      [ids[5]],
    );
    assert.equal((await command(body(p))).code, "conflict");
    assert.equal((await preview()).items.length, 3);
    await db.query(
      "update hub_activity_sessions set cancelled=false,version=version+1 where id=$1",
      [ids[5]],
    );
    p = await preview();
    await db.query(
      "update hub_activity_sessions set starts_at=now()-interval '1 day',ends_at=now()-interval '23 hours',version=version+1 where id=$1",
      [ids[5]],
    );
    assert.equal((await command(body(p))).code, "conflict");
    const original = beforeSessions.find((r) => r.id === ids[5]).row;
    await db.query(
      "update hub_activity_sessions set starts_at=$1,ends_at=$2,version=version+1 where id=$3",
      [original.starts_at, original.ends_at, ids[5]],
    );
    // Failed requests above changed no session cancellation flags.
    assert.deepEqual(
      (
        await db.query<any>(
          "select id from hub_activity_sessions where cancelled order by id",
        )
      ).rows.map((r) => r.id),
      [ids[1]],
    );
    const historyTables = [
      "hub_attendance",
      "hub_session_registrations",
      "hub_session_registration_settings",
      "hub_registration_charges",
      "hub_cash_receipts",
      "hub_cash_allocations",
      "hub_cash_allocation_corrections",
      "hub_cash_reversals",
    ];
    const history = async () =>
      Promise.all(
        historyTables.map(
          async (t) =>
            (
              await db.query<any>(
                `select to_jsonb(r) row from ${t} r order by to_jsonb(r)::text`,
              )
            ).rows,
        ),
      );
    const preserved = await history();
    // Standalone uses the same reviewed command but touches only itself.
    const single = await preview(standalone, "one");
    assert.equal(single.seriesId, null);
    assert.equal(single.items.length, 1);
    assert.equal(
      (await command(body(single, standalone, "one"), key(), "admin")).count,
      1,
    );
    p = await preview();
    const failingPayload = body(p);
    await db.exec(
      "create function test_cancel_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action='session.cancel' then raise exception 'Synthetic audit failure'; end if; return NEW; end $$; create trigger test_cancel_audit_failure before insert on hub_directory_audit for each row execute function test_cancel_audit_failure()",
    );
    await assert.rejects(command(failingPayload));
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from hub_activity_sessions where id=ANY($1::uuid[]) and cancelled",
          [ids.slice(2)],
        )
      ).rows[0].n,
      0,
    );
    assert.deepEqual(await history(), preserved);
    await db.exec(
      "drop trigger test_cancel_audit_failure on hub_directory_audit; drop function test_cancel_audit_failure()",
    );
    const payload = body(p),
      request = key(),
      result = await command(payload, request);
    assert.equal(result.count, 4);
    assert.equal(result.reviewRequired, true);
    assert.deepEqual(new Set(result.ids), new Set(ids.slice(2)));
    assert.deepEqual(await command(payload, request), result);
    assert.equal(
      (await command({ ...payload, reason: "Different" }, request)).code,
      "conflict",
    );
    assert.equal((await command(payload, request, "admin")).code, "conflict");
    assert.deepEqual(await history(), preserved);
    const after = (
      await db.query<any>(
        "select id,to_jsonb(s) as row from hub_activity_sessions s",
      )
    ).rows;
    for (const id of ids.slice(0, 2))
      assert.deepEqual(
        after.find((r) => r.id === id),
        beforeSessions.find((r) => r.id === id),
      );
    for (const id of ids.slice(2)) {
      const row = after.find((r) => r.id === id).row;
      assert.equal(row.cancelled, true);
      assert.equal(row.cancellation_reason, payload.reason);
    }
    const ownerSession = (
      await store.session("owner", org, activity, ids[2]!)
    )[0]!;
    assert.equal(ownerSession.requiresCancellationReview, true);
    await createAccessStore("", run).save("owner", org, null, key(), {
      userId: "helper",
      activityId: activity,
      groupId: null,
      canAttend: true,
      canCollect: true,
    });
    assert.equal(
      (await store.session("helper", org, activity, ids[2]!))[0]!
        .requiresCancellationReview,
      false,
    );
    await db.query(
      "insert into hub_cash_reversals(organization_id,receipt_id,reason,created_by)values($1,$2,'Explicit later correction','owner')",
      [org, receipt3],
    );
    assert.equal(
      (await store.session("owner", org, activity, ids[5]!))[0]!
        .requiresCancellationReview,
      false,
    );
    const stored = (
      await db.query<any>(
        "select response from hub_session_operations where organization_id=$1 and request_key=$2",
        [org, request],
      )
    ).rows[0].response;
    assert.equal(stored.cancellationHistory.length, 4);
    await db.query(
      "update hub_memberships set role='volunteer' where organization_id=$1 and user_id='owner'",
      [org],
    );
    assert.equal((await command(payload, request)).code, "forbidden");
    await db.query(
      "update hub_memberships set role='owner' where organization_id=$1 and user_id='owner'",
      [org],
    );
    const api = async (
      method: string,
      value: any,
      actor = "owner",
      verified = true,
    ) => {
      const r = await activityApi(
        new Request(
          `https://himmah.test/api/organizations/${org}/activities/${activity}/sessions?cancelPlan=true`,
          { method, ...(value ? { body: JSON.stringify(value) } : {}) },
        ),
        { id: actor, emailVerified: verified },
        organizations,
        store,
      );
      return r!;
    };
    assert.equal((await api("POST", { ...payload, key: request })).status, 200);
    assert.equal(
      (await api("POST", { ...payload, key: request }, "helper")).status,
      403,
    );
    assert.equal(
      (await api("POST", { ...payload, key: request }, "owner", false)).status,
      403,
    );
    assert.equal(
      (await api("POST", { ...payload, reason: "", key: key() })).status,
      400,
    );
    assert.equal((await api("DELETE", null)).status, 404);
    const deletion = (await store.deletionPreview("owner", org, activity))[0]!
      .result as any;
    assert.deepEqual(
      (
        await store.deleteActivity(
          "owner",
          org,
          activity,
          key(),
          deletion.snapshot,
        )
      )[0]!.result,
      { deleted: true },
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from hub_session_operations",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("cancellation preview and command share the authenticated activity rate limiter", async () => {
  const origin = "https://himmah.test",
    org = "11111111-1111-4111-8111-111111111111",
    activity = "22222222-2222-4222-8222-222222222222",
    anchor = "33333333-3333-4333-8333-333333333333";
  const keys: string[] = [];
  const handler = createHandler({
    store: () => ({}) as any,
    fetch: async () =>
      Response.json({ user: { id: "owner", emailVerified: true } }),
  });
  const env: Env = {
    HIMMAH_APP_ORIGIN: origin,
    HIMMAH_AUTH_URL: "https://auth.example.invalid/auth",
    HIMMAH_DATABASE_URL: "isolated-test",
    ASSETS: { fetch: async () => new Response("static") },
    ONBOARDING_LIMITER: {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: false };
      },
    },
  };
  const request = (method: string, cookie = true) =>
    new Request(
      `${origin}/api/organizations/${org}/activities/${activity}/sessions?${method === "GET" ? "cancellationPreview=" + anchor : "cancelPlan=true"}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(cookie ? { Cookie: "session=opaque" } : {}),
        },
      },
    );
  assert.equal((await handler(request("GET", false), env)).status, 401);
  assert.equal(keys.length, 0);
  assert.equal((await handler(request("GET"), env)).status, 429);
  assert.equal((await handler(request("POST"), env)).status, 429);
  assert.deepEqual(keys, ["activities:owner", "activities:owner"]);
});
