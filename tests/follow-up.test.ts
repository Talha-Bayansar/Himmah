import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { followUpFilters } from "../src/insights/follow-up.ts";
import { createFollowUpStore } from "../src/server/follow-up-store.ts";
import { followUpApi } from "../src/server/follow-up-api.ts";
import { createStore } from "../src/server/store.ts";
import { pageInput } from "../src/community/contracts.ts";
import { createHandler, type Env } from "../src/server/worker.ts";
test("follow-up validates its bounded calendar windows and two honest categories", () => {
  assert.deepEqual(followUpFilters({}), { days: 30, view: "recent" });
  assert.deepEqual(followUpFilters({ days: "7", view: "never" }), {
    days: 7,
    view: "never",
  });
  for (const f of [
    { days: 0 },
    { days: 365 },
    { days: "bad" },
    { view: "absent" },
    { view: "inactive" },
  ])
    assert.throws(() => followUpFilters(f));
});
test("follow-up reports current participation with timezone boundaries, archive history, scoped cursors and no writes", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      key = () => crypto.randomUUID();
    const run = async (s: any) => {
      const q = dialect.sqlToQuery(s);
      return (
        await db.query<any>(
          q.sql.replaceAll(
            "statement_timestamp()",
            "timestamptz '2026-11-01 00:30:00Z'",
          ),
          q.params,
        )
      ).rows;
    };
    const org = key(),
      foreign = key(),
      a = key(),
      archived = key(),
      fa = key();
    for (const [id, slug, user] of [
      [org, "follow-up", "owner"],
      [foreign, "foreign-follow", "other"],
    ]) {
      await db.query(
        "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Community',$2,'Europe/Brussels',$3,gen_random_uuid())",
        [id, slug, user],
      );
      await db.query(
        "insert into hub_memberships(organization_id,user_id,role)values($1,$2,'owner')",
        [id, user],
      );
    }
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'helper','volunteer')",
      [org],
    );
    for (const [id, o, cancelled] of [
      [a, org, false],
      [archived, org, true],
      [fa, foreign, false],
    ])
      await db.query(
        "insert into hub_activities(id,organization_id,name,description,location,timezone,cancelled,created_by,creation_key)values($1,$2,'Sohbet','','Hall','Europe/Brussels',$3,'owner',gen_random_uuid())",
        [id, o, cancelled],
      );
    async function contact(name: string, o = org, isArchived = false) {
      const id = key();
      await db.query(
        "insert into himmah.contacts(id,organization_id,display_name,archived_at,archived_by,created_at,created_by,updated_by)values($1,$2,$3,case when $4 then now() else null end,case when $4 then 'owner' else null end,'2026-11-01 00:00Z','owner','owner')",
        [id, o, name, isArchived],
      );
      return id;
    }
    async function visit(
      person: string,
      at: string,
      activity = a,
      o = org,
      cancelled = false,
    ) {
      const session = key();
      await db.query(
        "insert into hub_activity_sessions(id,organization_id,activity_id,name,topic,description,location,timezone,starts_at,ends_at,cancelled,created_by,creation_key)values($1,$2,$3,'Sohbet','Patience','','Hall','Europe/Brussels',$4::timestamptz,$4::timestamptz+interval '1 hour',$5,'owner',gen_random_uuid())",
        [session, o, activity, at, cancelled],
      );
      await db.query(
        "insert into hub_attendance(organization_id,activity_id,session_id,person_id,status,version)values($1,$2,$3,$4,'present',1)",
        [o, activity, session, person],
      );
      return session;
    }
    const old = await contact("Old visitor");
    await visit(old, "2026-08-01 18:00Z");
    await visit(old, "2026-09-01 18:00Z");
    const boundary = await contact("Boundary");
    await visit(boundary, "2026-10-02 22:00Z");
    const before = await contact("Before boundary");
    await visit(before, "2026-10-02 21:59:59.999999Z");
    const recent = await contact("Recent visitor");
    await visit(recent, "2026-10-25 18:00Z");
    const archive = await contact("Archived activity visitor");
    await visit(archive, "2026-08-01 18:00Z", archived);
    const archivedContact = await contact("Archived person", org, true);
    await visit(archivedContact, "2026-08-01 18:00Z");
    const cancelled = await contact("Cancelled only");
    await visit(cancelled, "2026-10-20 18:00Z", a, org, true);
    const future = await contact("Future only");
    await visit(future, "2026-11-02 18:00Z");
    const never = await contact("New person");
    const removed = await contact("Removed attendance");
    const removedSession = await visit(removed, "2026-10-20 18:00Z");
    await db.query(
      "delete from hub_attendance where organization_id=$1 and session_id=$2",
      [org, removedSession],
    );
    const other = await contact("Foreign person", foreign);
    await visit(other, "2026-08-01 18:00Z", fa, foreign);
    const batches = [];
    for (let i = 0; i < 58; i++) {
      const id = await contact("Batch " + i);
      batches.push(id);
      await visit(id, "2026-08-01 18:00:00.123456Z");
    }
    const store = createFollowUpStore("", run),
      organizations = createStore("", run);
    const api = async (
      query = "",
      user = "owner",
      verified = true,
      method = "GET",
    ) => {
      const r = await followUpApi(
        new Request(
          `https://himmah.test/api/organizations/${org}/insights/follow-up?${query}`,
          { method },
        ),
        { id: user, emailVerified: verified },
        organizations,
        store,
      );
      return { response: r!, body: await r!.json() };
    };
    const first = await api();
    assert.equal(first.response.status, 200);
    assert.equal(first.response.headers.get("cache-control"), "no-store");
    assert.equal(first.body.since, "2026-10-03");
    assert.deepEqual(first.body.summary, { recent: 61, never: 4 });
    assert.equal(first.body.items.length, 25);
    assert.ok(first.body.nextCursor);
    const all = [...first.body.items];
    let cursor = first.body.nextCursor;
    while (cursor) {
      const page = await api("cursor=" + encodeURIComponent(cursor));
      assert.deepEqual(page.body.summary, first.body.summary);
      all.push(...page.body.items);
      cursor = page.body.nextCursor;
    }
    assert.equal(new Set(all.map((r) => r.id)).size, 61);
    assert.equal(all.length, 61);
    assert.equal(all[0].id, archive);
    assert.equal(all.at(-1).id, before);
    assert.equal(
      all.find((r) => r.id === old).lastVisit,
      "2026-09-01 18:00:00+00",
    );
    assert.ok(
      !all.some((r) =>
        [
          boundary,
          recent,
          archivedContact,
          cancelled,
          future,
          never,
          removed,
          other,
        ].includes(r.id),
      ),
    );
    const none = await api("view=never");
    assert.deepEqual(
      new Set(none.body.items.map((r: any) => r.id)),
      new Set([cancelled, future, never, removed]),
    );
    assert.ok(
      none.body.items.every((r: any) => r.lastVisit === null && r.createdAt),
    );
    assert.equal((await api("days=90")).body.summary.recent, 59);
    assert.equal((await api("days=7")).body.summary.recent, 63);
    const batch = await api("q=Batch");
    assert.equal(batch.body.summary.recent, 58);
    assert.equal(batch.body.summary.never, 0);
    for (const query of [
      "days=8",
      "view=absent",
      "archived=true",
      "group=" + a,
      "limit=51",
      "cursor=bad",
      "days=7&cursor=" + encodeURIComponent(first.body.nextCursor),
      "q=Batch&cursor=" + encodeURIComponent(first.body.nextCursor),
      "view=never&cursor=" + encodeURIComponent(first.body.nextCursor),
    ])
      assert.equal((await api(query)).response.status, 400);
    assert.equal((await api("", "helper")).response.status, 403);
    assert.equal((await api("", "other")).response.status, 404);
    assert.equal((await api("", "owner", false)).response.status, 403);
    assert.equal((await api("", "owner", true, "POST")).response.status, 404);
    const p = pageInput(new URL("https://himmah.test"), "untrusted");
    assert.deepEqual(
      await store.get("helper", org, { days: 30, view: "recent" }, p),
      [],
    );
    assert.deepEqual(
      await store.get("other", org, { days: 30, view: "recent" }, p),
      [],
    );
    // A newly recorded valid visit removes a contact from follow-up immediately.
    await visit(old, "2026-10-31 18:00Z");
    assert.equal((await api("q=Old")).body.summary.recent, 0);
    const beforeCounts = (
      await db.query<any>(
        "select (select count(*) from hub_attendance) attendance,(select count(*) from hub_registration_charges) charges,(select count(*) from hub_cash_receipts) receipts,(select count(*) from hub_directory_audit) audit",
      )
    ).rows;
    await api("view=never");
    await api("q=%25");
    assert.deepEqual(
      (
        await db.query<any>(
          "select (select count(*) from hub_attendance) attendance,(select count(*) from hub_registration_charges) charges,(select count(*) from hub_cash_receipts) receipts,(select count(*) from hub_directory_audit) audit",
        )
      ).rows,
      beforeCounts,
    );
  } finally {
    await db.close();
  }
});
test("follow-up Worker dispatch requires authentication and read rate limiting", async () => {
  const origin = "https://himmah.test",
    org = "11111111-1111-4111-8111-111111111111";
  let allowed = true,
    verified = true,
    role = "owner",
    calls = 0;
  const handler = createHandler({
    store: () => ({ get: async () => ({ id: org, role }) }) as any,
    followUp: () => ({
      get: async () => {
        calls++;
        return [{ items: [], summary: { recent: 0, never: 0 } }];
      },
    }),
    fetch: async () =>
      Response.json({ user: { id: "owner", emailVerified: verified } }),
  });
  const env: Env = {
    HIMMAH_APP_ORIGIN: origin,
    HIMMAH_AUTH_URL: "https://auth.example.invalid/auth",
    HIMMAH_DATABASE_URL: "isolated-test",
    ASSETS: { fetch: async () => new Response("static") },
    ONBOARDING_LIMITER: { limit: async () => ({ success: allowed }) },
  };
  const req = (cookie = true) =>
    new Request(`${origin}/api/organizations/${org}/insights/follow-up`, {
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: "session=opaque" } : {}),
      },
    });
  assert.equal((await handler(req(false), env)).status, 401);
  assert.equal((await handler(req(), env)).status, 200);
  assert.equal(calls, 1);
  allowed = false;
  assert.equal((await handler(req(), env)).status, 429);
  allowed = true;
  role = "volunteer";
  assert.equal((await handler(req(), env)).status, 403);
  role = "owner";
  verified = false;
  assert.equal((await handler(req(), env)).status, 403);
  assert.equal(calls, 1);
});
