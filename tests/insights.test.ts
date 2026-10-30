import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import {
  createInsightsStore,
  insightsStatement,
} from "../src/server/insights-store.ts";
import { insightsApi } from "../src/server/insights-api.ts";
import { insightsFilters } from "../src/insights/contracts.ts";
import { createStore } from "../src/server/store.ts";
import { pageInput } from "../src/community/contracts.ts";

test("Insights validates real calendar dates, local defaults and bounded ranges", () => {
  assert.equal(
    insightsFilters({}, "Europe/Brussels", new Date("2020-03-31T22:30:00Z"))
      .from,
    "2020-04-01",
  );
  assert.equal(
    insightsFilters({ from: "2020-02-29", to: "2020-03-01" }, "UTC").from,
    "2020-02-29",
  );
  for (const values of [
    { from: "2021-02-29", to: "2021-03-01" },
    { from: "2020-01-02", to: "2020-01-01" },
    { from: "2020-01-01", to: "2022-01-01" },
    { bucket: "hour" },
    { activity: "forged" },
  ])
    assert.throws(() => insightsFilters(values, "UTC"));
});
test("Insights SQL/API reconciles attendance, historical cohorts, cash timing, corrections and access", async (t) => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      run = async (statement: any) => {
        const q = dialect.sqlToQuery(statement);
        return (await db.query<any>(q.sql, q.params)).rows;
      };
    const store = createInsightsStore("", run),
      organizations = createStore("", run),
      key = () => crypto.randomUUID(),
      org = key(),
      foreign = key();
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Insights','insights','Europe/Brussels','owner',gen_random_uuid()),($2,'Foreign','foreign-insights','UTC','other',gen_random_uuid())`,
      [org, foreign],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner'),($1,'admin','admin'),($1,'volunteer','volunteer'),($2,'other','owner')`,
      [org, foreign],
    );
    const contacts = [key(), key(), key()];
    for (let i = 0; i < 3; i++)
      await db.query(
        `insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,$3,'owner','owner')`,
        [contacts[i], org, "Contact " + i],
      );
    const group = key(),
      overlap = key();
    await db.query(
      `insert into himmah.groups(id,organization_id,name,description,created_by,updated_by)values($1,$3,'Historical group','','owner','owner'),($2,$3,'Overlapping group','','owner','owner')`,
      [group, overlap, org],
    );
    await db.query(
      `insert into himmah.group_memberships(organization_id,group_id,contact_id,valid_from,valid_to,created_by,updated_by)values($1,$2,$4,'2019-01-01',null,'owner','owner'),($1,$2,$5,'2019-01-01','2020-03-30T12:00Z','owner','owner'),($1,$2,$6,'2020-04-01',null,'owner','owner'),($1,$3,$4,'2019-01-01',null,'owner','owner')`,
      [org, group, overlap, ...contacts],
    );
    const activity = key(),
      oldActivity = key(),
      emptyActivity = key();
    for (const [id, name] of [
      [activity, "Gathering"],
      [oldActivity, "Earlier activity"],
      [emptyActivity, "Empty gathering"],
    ])
      await db.query(
        `insert into hub_activities(id,organization_id,name,description,location,timezone,audience_group_ids,price_minor,created_by,creation_key)values($1,$2,$3,'','','Europe/Brussels','{}',1000,'owner',gen_random_uuid())`,
        [id, org, name],
      );
    const sessions = {
      old: key(),
      first: key(),
      last: key(),
      boundary: key(),
      cancelled: key(),
      future: key(),
      empty: key(),
    };
    const dates = {
      old: "2020-02-10T10:00Z",
      first: "2020-03-29T22:30Z",
      last: "2020-03-31T21:59Z",
      boundary: "2020-03-31T22:00Z",
      cancelled: "2020-03-30T10:00Z",
      future: "2099-01-01T10:00Z",
      empty: "2020-03-31T10:00Z",
    };
    for (const [kind, id] of Object.entries(sessions))
      await db.query(
        `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,audience_group_ids,price_minor,starts_at,ends_at,cancelled,created_by,creation_key)values($1,$2,$3,$4,'','','Europe/Brussels',$7::uuid[],1000,$5::timestamptz,$5::timestamptz+interval '1 hour',$6,'owner',gen_random_uuid())`,
        [
          id,
          org,
          kind === "old"
            ? oldActivity
            : kind === "empty"
              ? emptyActivity
              : activity,
          kind,
          dates[kind as keyof typeof dates],
          kind === "cancelled",
          kind === "empty" ? [group] : [],
        ],
      );
    const attend = async (session: string, person: string) =>
      db.query(
        `insert into hub_attendance(organization_id,activity_id,session_id,person_id,status,version)select $1,activity_id,id,$3,'present',1 from hub_activity_sessions where id=$2`,
        [org, session, person],
      );
    await attend(sessions.old, contacts[0]!);
    for (const person of contacts.slice(0, 2))
      await attend(sessions.first, person);
    for (const person of [contacts[0]!, contacts[2]!])
      await attend(sessions.last, person);
    await attend(sessions.boundary, contacts[1]!);
    await attend(sessions.cancelled, contacts[2]!);
    await attend(sessions.future, contacts[2]!);
    await db.query(
      `update himmah.contacts set archived_at=now(),archived_by='owner' where id=$1`,
      [contacts[1]],
    );
    await db.query(
      `insert into hub_session_registrations(organization_id,activity_id,session_id,person_id,status,version,source)values($1,$2,$3,$4,'confirmed',1,'advance')`,
      [org, activity, sessions.first, contacts[1]],
    );
    const charges = [key(), key(), key(), key()];
    for (const [i, session, person, amount] of [
      [0, sessions.first, contacts[0], 1000],
      [1, sessions.first, contacts[1], 1000],
      [2, sessions.last, contacts[2], 2000],
      [3, sessions.old, contacts[0], 200],
    ] as const)
      await db.query(
        `insert into hub_registration_charges(id,organization_id,activity_id,session_id,person_id,source,amount_minor,created_by)select $1,$2,activity_id,id,$4,'walk_in',$5,'owner' from hub_activity_sessions where id=$3`,
        [charges[i], org, session, person, amount],
      );
    const receipts = [key(), key(), key(), key()];
    for (const [i, session, amount, date] of [
      [0, sessions.first, 1800, "2020-04-05T12:00Z"],
      [1, sessions.last, 1500, "2020-03-30T12:00Z"],
      [2, sessions.first, 700, "2020-03-30T12:00Z"],
      [3, sessions.old, 100, "2020-03-30T12:00Z"],
    ] as const)
      await db.query(
        `insert into hub_cash_receipts(id,organization_id,activity_id,session_id,amount_minor,occurred_at,created_by)select $1,$2,activity_id,id,$4,$5::timestamptz,'owner' from hub_activity_sessions where id=$3`,
        [receipts[i], org, session, amount, date],
      );
    await db.query(
      `insert into hub_cash_allocations(organization_id,receipt_id,charge_id,amount_minor)values($1,$2,$6,1000),($1,$2,$7,500),($1,$3,$8,1500),($1,$4,$7,500),($1,$5,$9,50)`,
      [org, ...receipts, ...charges],
    );
    await db.query(
      `insert into hub_cash_reversals(organization_id,receipt_id,reason,created_by)values($1,$2,'Incorrect entry','owner')`,
      [org, receipts[2]],
    );
    for (const [session, amount] of [
      [sessions.cancelled, 600],
      [sessions.future, 750],
    ] as const)
      await db.query(
        `insert into hub_registration_charges(organization_id,activity_id,session_id,person_id,source,amount_minor,created_by)values($1,$2,$3,$4,'walk_in',$5,'owner')`,
        [org, activity, session, contacts[2], amount],
      );
    const filters = insightsFilters(
        { from: "2020-03-30", to: "2020-03-31" },
        "Europe/Brussels",
      ),
      p = pageInput(new URL("https://himmah.test"), "insights-test");
    const report = async (overrides = {}) =>
      (
        await store.report("owner", org, { ...filters, ...overrides }, p)
      )[0] as any;
    await t.test(
      "timezone boundaries, cancellation, archived contacts, first/returning and registration reconcile",
      async () => {
        const r = await report();
        assert.equal(r.summary.sessions, 3);
        assert.equal(r.summary.visits, 4);
        assert.equal(r.summary.unique, 3);
        assert.equal(r.summary.first, 2);
        assert.equal(r.summary.returning, 1);
        assert.equal(r.summary.registrations, 1);
        assert.equal(r.summary.registeredPresent, 1);
        assert.equal(r.summary.walkIns, 3);
        assert.equal(r.summary.chargedMinor, 4600);
        assert.equal(r.summary.paidMinor, 3000);
        assert.equal(r.summary.outstandingMinor, 1600);
        assert.equal(r.summary.cashMinor, 1600);
        const future = await report({ from: "2099-01-01", to: "2099-01-31" });
        assert.equal(future.summary.visits, 0);
        assert.equal(future.summary.chargedMinor, 750);

        assert.equal(r.summary.unallocatedMinor, 50);
        assert.equal(
          r.trend.reduce((sum: number, x: any) => sum + x.visits, 0),
          4,
        );
        assert.equal(
          r.items.reduce((sum: number, x: any) => sum + x.visits, 0),
          4,
        );
      },
    );
    await t.test(
      "calendar comparisons reconcile prior participation and correction-aware balances without current-period leakage",
      async () => {
        const r = await report({ from: "2020-03-01", to: "2020-03-31" });
        assert.equal(r.summary.comparisonKind, "month");
        assert.equal(r.summary.previousFrom, "2020-02-01");
        assert.equal(r.summary.previousTo, "2020-02-29");
        assert.deepEqual(r.summary.previous, {
          sessions: 1,
          visits: 1,
          unique: 1,
          first: 1,
          returning: 0,
          chargedMinor: 200,
          paidMinor: 50,
          outstandingMinor: 150,
        });
        assert.equal(r.summary.first, 2);
        assert.equal(r.summary.returning, 1);
        // A partial month compares February 1–5, not all of February or the intervening days.
        const partial = await report({ from: "2020-03-01", to: "2020-03-05" });
        assert.equal(partial.summary.previousTo, "2020-02-05");
        assert.equal(partial.summary.previous.visits, 0);
        assert.equal(partial.summary.previous.chargedMinor, 0);
        assert.equal(partial.summary.visits, 0);
        assert.equal(partial.summary.chargedMinor, 0);
        const activityScoped = await report({
          from: "2020-03-01",
          to: "2020-03-31",
          activity,
        });
        assert.equal(activityScoped.summary.previous.visits, 0);
        assert.equal(activityScoped.summary.returning, 1);
        const groupScoped = await report({
          from: "2020-03-01",
          to: "2020-03-31",
          group,
        });
        assert.equal(groupScoped.summary.previous.visits, 1);
        assert.equal(groupScoped.summary.previous.chargedMinor, 200);
      },
    );
    await t.test(
      "group membership is historical and overlapping groups are not added together",
      async () => {
        const g = await report({ group }),
          h = await report({ group: overlap });
        assert.equal(g.summary.visits, 3);
        assert.equal(g.summary.unique, 2);
        assert.equal(h.summary.visits, 2);
        assert.equal(g.summary.cashMinor, 50);
        assert.equal(g.summary.unallocatedMinor, null);
        assert.equal(g.summary.chargedMinor, 2000);
        assert.equal(g.summary.paidMinor, 1500);
      },
    );
    await t.test(
      "activity filters keep organization-wide first recorded classification",
      async () => {
        const r = await report({ activity });
        assert.equal(r.summary.returning, 1);
        assert.equal(r.summary.cashMinor, 1500);
        assert.equal(r.items.length, 1);
        assert.deepEqual(
          (await report({ from: "2010-01-01", to: "2010-01-31" })).summary
            .visits,
          0,
        );
      },
    );
    await t.test(
      "corrections recompute session balances and cash in their original receipt window",
      async () => {
        await db.query(
          `insert into hub_cash_allocation_corrections(organization_id,receipt_id,charge_id,request_key,reason,created_by)values($1,$2,$3,gen_random_uuid(),'unpaid','owner')`,
          [org, receipts[1], charges[2]],
        );
        const r = await report();
        assert.equal(r.summary.paidMinor, 1500);
        assert.equal(r.summary.outstandingMinor, 3100);
        assert.equal(r.summary.cashMinor, 100);
        assert.equal(r.summary.visits, 4);
      },
    );
    await t.test(
      "prior-period balances also exclude contact-specific corrections",
      async () => {
        await db.exec("begin");
        try {
          await db.query(
            `insert into hub_cash_allocation_corrections(organization_id,receipt_id,charge_id,request_key,reason,created_by)values($1,$2,$3,gen_random_uuid(),'unpaid','owner')`,
            [org, receipts[3], charges[3]],
          );
          const r = await report({ from: "2020-03-01", to: "2020-03-31" });
          assert.equal(r.summary.previous.paidMinor, 0);
          assert.equal(r.summary.previous.outstandingMinor, 200);
          assert.equal(r.summary.previous.visits, 1);
        } finally {
          await db.exec("rollback");
        }
      },
    );
    const base = `https://himmah.test/api/organizations/${org}/insights?from=2020-03-30&to=2020-03-31`;
    const call = async (
      url = base,
      actor = "owner",
      verified = true,
      method = "GET",
    ) => {
      const response = await insightsApi(
        new Request(url, { method }),
        { id: actor, emailVerified: verified },
        organizations,
        store,
      );
      return {
        status: response!.status,
        body: (await response!.json()) as any,
        cache: response!.headers.get("cache-control"),
      };
    };
    await t.test(
      "API/store enforce reporting independently of volunteer operational access",
      async () => {
        assert.equal((await call()).status, 200);
        assert.equal((await call()).cache, "no-store");
        assert.equal((await call(base, "admin")).status, 200);
        assert.equal((await call(base, "volunteer")).status, 403);
        assert.equal((await call(base, "other")).status, 404);
        assert.equal((await call(base, "owner", false)).status, 403);
        assert.equal((await call(base, "owner", true, "POST")).status, 404);
        assert.equal(
          (await store.report("volunteer", org, filters, p)).length,
          0,
        );
        assert.equal(
          (await store.report("owner", foreign, filters, p)).length,
          0,
        );
        assert.equal((await call(base + "&activity=" + key())).status, 400);
        assert.equal((await call(base + "&from=2020-02-30")).status, 400);
      },
    );
    await t.test(
      "activity and picker cursors are bounded and bound to filters and tenant",
      async () => {
        const first = await call(base + "&limit=1");
        assert.equal(first.body.items.length, 1);
        assert.ok(first.body.nextCursor);
        const next = await call(
          base + "&limit=1&cursor=" + encodeURIComponent(first.body.nextCursor),
        );
        assert.equal(next.body.items.length, 1);
        assert.notEqual(first.body.items[0].id, next.body.items[0].id);
        assert.equal(
          (
            await call(
              base +
                "&bucket=month&cursor=" +
                encodeURIComponent(first.body.nextCursor),
            )
          ).status,
          400,
        );
        const options = await call(
          `https://himmah.test/api/organizations/${org}/insights/options?kind=groups&limit=1`,
        );
        assert.ok(options.body.nextCursor);
        assert.equal(
          (
            await call(
              `https://himmah.test/api/organizations/${org}/insights/options?kind=activities&cursor=${encodeURIComponent(options.body.nextCursor)}`,
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "report query plan is inspectable on disposable data",
      async () => {
        await db.query(
          `insert into hub_activity_sessions(organization_id,activity_id,name,description,location,timezone,audience_group_ids,price_minor,starts_at,ends_at,created_by,creation_key)
      select $1,$2,'Plan fixture','','','Europe/Brussels','{}',0,'2019-01-01'::timestamptz+i*interval '1 day','2019-01-01'::timestamptz+i*interval '1 day'+interval '1 hour','owner',gen_random_uuid() from generate_series(1,1500) i`,
          [org, activity],
        );
        await db.exec("analyze hub_activity_sessions; analyze hub_attendance;");
        const q = dialect.sqlToQuery(
          insightsStatement("owner", org, filters, p),
        );
        const plan = await db.query<any>(
          "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + q.sql,
          q.params,
        );
        assert.ok(plan.rows[0]);
      },
    );
  } finally {
    await db.close();
  }
});
