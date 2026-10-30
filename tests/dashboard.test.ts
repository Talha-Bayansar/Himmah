import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import {
  createDashboardStore,
  dashboardStatement,
} from "../src/server/dashboard-store.ts";
import { dashboardApi } from "../src/server/dashboard-api.ts";
import { createStore } from "../src/server/store.ts";
import { createAccessStore } from "../src/server/access-store.ts";

test("Dashboard returns three chronological scoped sessions, includes in-progress and excludes ended/cancelled work", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      run = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<any>(q.sql, q.params)).rows;
      };
    const key = () => crypto.randomUUID(),
      org = key(),
      foreign = key(),
      activity = key(),
      otherActivity = key();
    for (const [id, name, user] of [
      [org, "Community", "owner"],
      [foreign, "Foreign", "foreign"],
    ]) {
      await db.query(
        `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,$2,lower($2),'Europe/Brussels',$3,gen_random_uuid())`,
        [id, name, user],
      );
      await db.query(
        `insert into hub_memberships(organization_id,user_id,role)values($1,$2,'owner')`,
        [id, user],
      );
    }
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role)values($1,'helper','volunteer'),($1,'none','volunteer')`,
      [org],
    );
    for (const [id, o] of [
      [activity, org],
      [otherActivity, foreign],
    ])
      await db.query(
        `insert into hub_activities(id,organization_id,name,description,location,timezone,audience_group_ids,created_by,creation_key)values($1,$2,'Gathering','','','Europe/Brussels','{}','owner',gen_random_uuid())`,
        [id, o],
      );
    const ids: string[] = [];
    for (const [i, start, end, cancel] of [
      [0, -1, 1, false],
      [1, 2, 3, false],
      [2, 4, 5, false],
      [3, 6, 7, false],
      [4, -3, -2, false],
      [5, 1, 2, true],
    ] as const) {
      const id = key();
      ids.push(id);
      await db.query(
        `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,audience_group_ids,starts_at,ends_at,cancelled,created_by,creation_key)values($1,$2,$3,$4,'','Hall','Europe/Brussels','{}',now()+($5||' hours')::interval,now()+($6||' hours')::interval,$7,'owner',gen_random_uuid())`,
        [id, org, activity, "Session " + i, start, end, cancel],
      );
    }
    await db.query(
      `insert into hub_activity_sessions(organization_id,activity_id,name,description,location,timezone,audience_group_ids,starts_at,ends_at,created_by,creation_key)values($1,$2,'Foreign secret','','','UTC','{}',now()+interval '1 minute',now()+interval '1 hour','foreign',gen_random_uuid())`,
      [foreign, otherActivity],
    );
    const store = createDashboardStore("", run),
      organizations = createStore("", run);
    const report = (await store.get("owner", org))[0]!;
    assert.deepEqual(
      (report.items as any[]).map((s) => s.id),
      ids.slice(0, 3),
    );
    assert.ok(Number.isFinite(Date.parse(String(report.generatedAt))));
    assert.equal((await store.get("foreign", org)).length, 0);
    assert.equal(
      ((await store.get("helper", org))[0]!.items as any[]).length,
      0,
    );
    const access = createAccessStore("", run);
    const assignment = (
      await access.save("owner", org, null, key(), {
        userId: "helper",
        activityId: activity,
        groupId: null,
        canAttend: true,
        canCollect: false,
      })
    )[0];
    assert.equal(
      ((await store.get("helper", org))[0]!.items as any[]).length,
      3,
    );
    assert.equal(
      ((await store.get("helper", org))[0]!.items as any[])[0].canCollect,
      false,
    );
    await db.query(
      `update hub_volunteer_assignments set revoked_at=now() where organization_id=$1 and user_id='helper'`,
      [org],
    );
    assert.deepEqual((await store.get("helper", org))[0]!.items, []);
    await db.query(`update hub_activities set cancelled=true where id=$1`, [
      activity,
    ]);
    assert.deepEqual((await store.get("owner", org))[0]!.items, []);
    const request = (method = "GET") =>
      new Request(`https://himmah.test/api/organizations/${org}/dashboard`, {
        method,
      });
    const user = { id: "owner", emailVerified: true };
    const response = (await dashboardApi(
      request(),
      user,
      organizations,
      store,
    ))!;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      (await dashboardApi(request("POST"), user, organizations, store))!.status,
      404,
    );
    assert.equal(
      (await dashboardApi(
        request(),
        { ...user, emailVerified: false },
        organizations,
        store,
      ))!.status,
      403,
    );
    assert.equal(
      (await dashboardApi(
        request(),
        { id: "foreign", emailVerified: true },
        organizations,
        store,
      ))!.status,
      404,
    );
    await db.query(
      `delete from hub_memberships where organization_id=$1 and user_id='owner'`,
      [org],
    );
    assert.equal((await store.get("owner", org)).length, 0);
    assert.equal(
      (await dashboardApi(request(), user, organizations, store))!.status,
      404,
    );
    // Preview reads never create attendance, charges or cash.
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
