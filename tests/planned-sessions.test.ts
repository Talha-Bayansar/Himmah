import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createDashboardStore } from "../src/server/dashboard-store.ts";
import { dashboardApi } from "../src/server/dashboard-api.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { createStore } from "../src/server/store.ts";
import { pageInput } from "../src/community/contracts.ts";

test("planned sessions page across activities is chronological, cursor scoped and read-only", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect();
    const run = async (s: any) => {
      const q = dialect.sqlToQuery(s);
      return (await db.query<any>(q.sql, q.params)).rows;
    };
    const key = () => crypto.randomUUID(),
      org = key(),
      foreign = key(),
      a = key(),
      b = key(),
      archived = key(),
      fa = key();
    for (const [id, slug, user] of [
      [org, "agenda", "owner"],
      [foreign, "foreign-agenda", "foreign"],
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
    for (const [id, o, name, cancelled] of [
      [a, org, "Sohbet", false],
      [b, org, "Workshop", false],
      [archived, org, "Archived", true],
      [fa, foreign, "Foreign secret", false],
    ])
      await db.query(
        "insert into hub_activities(id,organization_id,name,description,location,timezone,cancelled,created_by,creation_key)values($1,$2,$3,'','','Europe/Brussels',$4,'owner',gen_random_uuid())",
        [id, o, name, cancelled],
      );
    await db.query(
      `insert into hub_activity_sessions(organization_id,activity_id,name,topic,description,location,timezone,starts_at,ends_at,created_by,creation_key)
 select $1,case when i%2=0 then $2::uuid else $3::uuid end,case when i%2=0 then 'Sohbet' else 'Workshop' end,case when i=0 then 'Patience%' else 'Topic '||i end,'',case when i=1 then 'Hall_One' else 'Main hall' end,'Europe/Brussels',timestamptz '2099-01-01 18:00:00.123456+00'+(i/2)*interval '1 day',timestamptz '2099-01-01 19:00:00.123456+00'+(i/2)*interval '1 day','owner',gen_random_uuid() from generate_series(0,52) i`,
      [org, a, b],
    );
    for (const [o, activity, name, start, end, cancel] of [
      [org, a, "In progress", -1, 1, false],
      [org, a, "Ended", -3, -2, false],
      [org, a, "Cancelled", 1, 2, true],
      [org, archived, "Archived session", 1, 2, false],
      [foreign, fa, "Foreign session", 1, 2, false],
    ])
      await db.query(
        "insert into hub_activity_sessions(organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,cancelled,created_by,creation_key)values($1,$2,$3,'','','Europe/Brussels',now()+($4||' hours')::interval,now()+($5||' hours')::interval,$6,'owner',gen_random_uuid())",
        [o, activity, name, start, end, cancel],
      );
    const store = createDashboardStore("", run),
      organizations = createStore("", run),
      access = createAccessStore("", run);
    const get = async (
      query = "",
      user = "owner",
      method = "GET",
      verified = true,
    ) => {
      const response = await dashboardApi(
        new Request(
          `https://himmah.test/api/organizations/${org}/sessions?${query}`,
          { method },
        ),
        { id: user, emailVerified: verified },
        organizations,
        store,
      );
      return { response: response!, body: await response!.json() };
    };
    let first = await get();
    assert.equal(first.response.status, 200);
    assert.equal(first.response.headers.get("cache-control"), "no-store");
    assert.equal(first.body.items.length, 25);
    assert.ok(first.body.nextCursor);
    assert.equal(first.body.items[0].name, "In progress");
    const all = [...first.body.items];
    let cursor = first.body.nextCursor;
    while (cursor) {
      const page = await get("cursor=" + encodeURIComponent(cursor));
      all.push(...page.body.items);
      cursor = page.body.nextCursor;
    }
    const expected = (
      await db.query<any>(
        "select s.id from hub_activity_sessions s join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id where s.organization_id=$1 and not s.cancelled and not a.cancelled and s.ends_at>now() order by s.starts_at,s.id",
        [org],
      )
    ).rows.map((r) => r.id);
    assert.deepEqual(
      all.map((r) => r.id),
      expected,
    );
    assert.equal(all.length, 54);
    assert.equal(new Set(all.map((r) => r.id)).size, 54);
    assert.ok(new Set(all.map((r) => r.activityId)).size === 2);
    assert.deepEqual(
      ((await store.get("owner", org))[0]!.items as any[]).map((r) => r.id),
      all.slice(0, 3).map((r) => r.id),
    );
    assert.equal((await get("q=%25")).body.items[0].topic, "Patience%");
    assert.equal((await get("q=%25")).body.items.length, 1);
    assert.equal((await get("q=Hall_One")).body.items.length, 1);
    assert.equal((await get("q=Workshop")).body.items.length, 25);
    for (const query of [
      "limit=51",
      "group=" + a,
      "archived=true",
      "cursor=bad",
      "q=Workshop&cursor=" + encodeURIComponent(first.body.nextCursor),
    ])
      assert.equal((await get(query)).response.status, 400);
    const scope = pageInput(new URL("https://himmah.test?limit=50"), "test");
    assert.deepEqual(await store.sessions("foreign", org, scope), []);
    assert.deepEqual((await get("", "helper")).body.items, []);
    await access.save("owner", org, null, key(), {
      userId: "helper",
      activityId: a,
      groupId: null,
      canAttend: true,
      canCollect: false,
    });
    const helper = await get("limit=50", "helper");
    assert.ok(helper.body.items.length > 3);
    assert.ok(helper.body.items.every((r: any) => r.activityId === a));
    assert.ok(
      helper.body.items.every((r: any) => r.canAttend && !r.canCollect),
    );
    assert.equal(
      (
        await get(
          "cursor=" + encodeURIComponent(first.body.nextCursor),
          "helper",
        )
      ).response.status,
      400,
    );
    await db.query(
      "update hub_volunteer_assignments set revoked_at=now() where organization_id=$1 and user_id='helper'",
      [org],
    );
    assert.deepEqual((await get("", "helper")).body.items, []);
    assert.equal((await get("", "foreign")).response.status, 404);
    assert.equal((await get("", "owner", "POST")).response.status, 404);
    assert.equal((await get("", "owner", "GET", false)).response.status, 403);
    // Disappearing rows do not duplicate the remaining chronological pages.
    await db.query(
      "update hub_activity_sessions set cancelled=true where id=$1",
      [all[0].id],
    );
    const next = await get(
      "cursor=" + encodeURIComponent(first.body.nextCursor),
    );
    assert.ok(
      next.body.items.every(
        (r: any) => !first.body.items.some((old: any) => old.id === r.id),
      ),
    );
    for (const table of [
      "hub_attendance",
      "hub_registration_charges",
      "hub_cash_receipts",
    ])
      assert.equal(
        (await db.query<any>(`select count(*)::int n from ${table}`)).rows[0].n,
        0,
      );
  } finally {
    await db.close();
  }
});
