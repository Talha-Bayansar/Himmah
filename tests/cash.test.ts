import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createRegistrationStore } from "../src/server/registration-store.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { createDirectoryStore } from "../src/modules/people/directory-store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { createCashStore } from "../src/server/cash-store.ts";
import { createStore } from "../src/server/store.ts";
import { cashApi } from "../src/server/cash-api.ts";
import { cashInput } from "../src/cash/contracts.ts";
import { pageInput } from "../src/community/contracts.ts";
test("cash validates bounded canonical allocations and decimal-free payloads", () => {
  const key = crypto.randomUUID(),
    id = crypto.randomUUID(),
    date = new Date().toISOString();
  const body = {
    key,
    action: "record",
    amountMinor: 1500,
    payerLabel: " Parent ",
    occurredAt: date,
    allocations: [{ chargeId: id, version: 1, amountMinor: 1500 }],
  };
  assert.equal(cashInput(body, "UTC").payload.payerLabel, "Parent");
  for (const patch of [
    { amountMinor: 1.1 },
    { amountMinor: -1 },
    { allocations: [] },
    { allocations: [...body.allocations, ...body.allocations] },
    { allocations: [{ chargeId: id, version: 1, amountMinor: 1501 }] },
    { occurredAt: "2099-01-01T00:00:00.000Z" },
  ])
    assert.throws(() => cashInput({ ...body, ...patch }, "UTC"));
});
test("cash receipts and sibling allocations preserve balances, history, scope and exact retries", async (t) => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      run = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
      };
    const cash = createCashStore("", run),
      people = createPeopleStore("", run),
      activities = createActivityStore("", run),
      registrations = createRegistrationStore("", run),
      access = createAccessStore("", run),
      organizations = createStore("", run),
      key = () => crypto.randomUUID(),
      org = key(),
      other = key();
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Cash test','cash-test','UTC','owner',$3),($2,'Other','cash-other','UTC','other',$4)`,
      [org, other, key(), key()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role,display_name)values($1,'owner','owner','Collector'),($1,'helper','volunteer','Helper'),($1,'attendance','volunteer','Attendance'),($2,'other','owner','Other')`,
      [org, other],
    );
    const a = String(
        (
          await people.command("owner", org, "create", key(), {
            displayName: "Sibling A",
            givenName: null,
            familyName: null,
          })
        ).id,
      ),
      b = String(
        (
          await people.command("owner", org, "create", key(), {
            displayName: "Sibling B",
            givenName: null,
            familyName: null,
          })
        ).id,
      );
    const activity = String(
      (
        await activities.create("owner", org, key(), {
          name: "Paid gathering",
          description: "",
          location: "",
          timezone: "UTC",
          audienceGroupIds: [],
          priceMinor: 1000,
        })
      )[0]!.id,
    );
    const session = String(
      (
        await activities.createSession("owner", org, activity, key(), 1, {
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 90000000).toISOString(),
          location: "",
          timezone: "UTC",
        })
      )[0]!.id,
    );
    for (const personId of [a, b])
      await registrations.command("owner", org, activity, session, key(), {
        action: "register",
        personId,
        version: 0,
        contactVersion: 1,
        sessionVersion: 1,
        reason: "",
      });
    const p = pageInput(new URL("https://himmah.test"), "cash"),
      list = () => cash.list("owner", org, activity, session, p, "all"),
      summary = async () =>
        (await cash.summary("owner", org, activity, session))[0]!;
    const initial = await list(),
      ca = initial.find((c) => c.name === "Sibling A")!,
      cb = initial.find((c) => c.name === "Sibling B")!;
    const record = (amountMinor: number, allocations: any[]) => ({
      action: "record",
      amountMinor,
      payerLabel: "Parent",
      occurredAt: new Date().toISOString(),
      allocations,
    });
    const payload = record(1700, [
      { chargeId: ca.id, version: 1, amountMinor: 1000 },
      { chargeId: cb.id, version: 1, amountMinor: 500 },
    ]);
    const command = async (body: any, k = key(), actor = "owner") =>
      (await cash.command(actor, org, activity, session, k, body))[0]!
        .result as any;
    let receipt = "",
      retryKey = key();
    await t.test(
      "one receipt splits across siblings, retains explicit unallocated cash, and does not affect attendance",
      async () => {
        const result = await command(payload, retryKey);
        assert.ok(result.id);
        receipt = result.id;
        assert.deepEqual(await command(payload, retryKey), result);
        assert.equal(
          (await command({ ...payload, payerLabel: "Changed" }, retryKey)).code,
          "cash_key",
        );
        const rows = await list();
        assert.equal(rows.find((r) => r.id === ca.id)!.status, "paid");
        assert.equal(rows.find((r) => r.id === cb.id)!.status, "partial");
        const s = await summary();
        assert.equal(s.paidMinor, 1500);
        assert.equal(s.outstandingMinor, 500);
        assert.equal(s.collectedMinor, 1700);
        assert.equal(s.unallocatedMinor, 200);
        assert.equal(
          (await db.query<any>("select count(*)::int n from hub_attendance"))
            .rows[0]!.n,
          0,
        );
        assert.equal(
          (
            await db.query<any>(
              "select count(*)::int n from hub_session_registrations",
            )
          ).rows[0]!.n,
          2,
        );
      },
    );
    await t.test(
      "stale balances and overallocations fail without partial money writes",
      async () => {
        assert.equal(
          (
            await command(
              record(500, [{ chargeId: cb.id, version: 1, amountMinor: 500 }]),
            )
          ).code,
          "conflict",
        );
        assert.equal(
          (
            await command(
              record(500, [{ chargeId: cb.id, version: 2, amountMinor: 501 }]),
            )
          ).code,
          "cash_allocation",
        );
        assert.equal(
          (
            await command(
              record(400, [{ chargeId: cb.id, version: 2, amountMinor: 500 }]),
            )
          ).code,
          "cash_allocation",
        );
        assert.equal(
          (await db.query<any>("select count(*)::int n from hub_cash_receipts"))
            .rows[0]!.n,
          1,
        );
        assert.ok(
          (
            await command(
              record(500, [{ chargeId: cb.id, version: 2, amountMinor: 500 }]),
            )
          ).id,
        );
        assert.equal((await summary()).outstandingMinor, 0);
      },
    );
    await t.test(
      "reasoned correction preserves history, recomputes balances and prevents duplicate reversal",
      async () => {
        assert.equal(
          (await command({ action: "reverse", receiptId: receipt, reason: "" }))
            .code,
          "cash_reason",
        );
        const reversalKey = key(),
          reverse = {
            action: "reverse",
            receiptId: receipt,
            reason: "Entered wrong cash amount",
          };
        const result = await command(reverse, reversalKey);
        assert.ok(result.id);
        assert.deepEqual(await command(reverse, reversalKey), result);
        assert.equal((await command(reverse)).code, "conflict");
        const rows = await list();
        assert.equal(rows.find((r) => r.id === ca.id)!.paidMinor, 0);
        assert.equal(rows.find((r) => r.id === ca.id)!.version, 3);
        assert.equal(rows.find((r) => r.id === cb.id)!.paidMinor, 500);
        assert.equal(rows.find((r) => r.id === cb.id)!.version, 4);
        assert.equal((await summary()).collectedMinor, 500);
        const history = await cash.history("owner", org, activity, session, p);
        assert.equal(history.length, 2);
        assert.equal(history.find((r) => r.id === receipt)!.reversed, true);
        assert.equal(
          history.find((r) => r.id === receipt)!.collectorName,
          "Collector",
        );
        await assert.rejects(
          db.query("update hub_cash_receipts set amount_minor=1"),
        );
        await assert.rejects(db.query("delete from hub_cash_allocations"));
        await assert.rejects(db.query("delete from hub_cash_reversals"));
      },
    );
    await t.test(
      "cash grants are independent, contact scoped, revoked on replay and cannot reverse receipts",
      async () => {
        const group = String(
          (
            await createDirectoryStore(run, () => sql`true`).groupCommand(
              "owner",
              org,
              "create",
              key(),
              { name: "One sibling" },
            )
          ).id,
        );
        await db.query(
          `insert into himmah.group_memberships(organization_id,group_id,contact_id,created_by,updated_by)values($1,$2,$3,'owner','owner')`,
          [org, group, a],
        );
        const grantKey = key();
        const grant = (
          await access.save("owner", org, null, grantKey, {
            userId: "helper",
            groupId: group,
            activityId: null,
            canAttend: false,
            canCollect: true,
          })
        )[0]!.result as any;
        assert.equal(
          (
            (
              await access.save("owner", org, null, grantKey, {
                userId: "helper",
                groupId: group,
                activityId: null,
                canAttend: true,
                canCollect: false,
              })
            )[0]!.result as any
          ).code,
          "conflict",
        );
        await access.save("owner", org, null, key(), {
          userId: "attendance",
          groupId: null,
          activityId: activity,
          canAttend: true,
        });
        assert.equal(
          (await cash.summary("attendance", org, activity, session)).length,
          0,
        );
        assert.equal(
          (await cash.list("helper", org, activity, session, p, "all")).length,
          1,
        );
        assert.equal(
          (await cash.summary("helper", org, activity, session))[0]!
            .collectedMinor,
          null,
        );
        assert.equal(
          (await cash.history("helper", org, activity, session, p)).length,
          0,
        );
        assert.equal(
          (
            await command(
              record(500, [{ chargeId: cb.id, version: 4, amountMinor: 500 }]),
              key(),
              "helper",
            )
          ).code,
          "forbidden",
        );
        assert.equal(
          (
            await command(
              { action: "reverse", receiptId: receipt, reason: "No" },
              key(),
              "helper",
            )
          ).code,
          "forbidden",
        );
        // Disposable provider-shaped fixture only; hosted auth remains read-only.
        const profileId = key();
        await db.exec(
          'create schema if not exists neon_auth; create table if not exists neon_auth."user"(id uuid primary key,name text);',
        );
        await db.query('insert into neon_auth."user"(id,name) values($1,$2)', [
          profileId,
          "Current collector profile",
        ]);
        await db.query(
          "insert into hub_memberships(organization_id,user_id,role)values($1,$2,'volunteer')",
          [org, profileId],
        );
        assert.equal(
          (
            await access.staff("owner", org, {
              ...p,
              query: "Current collector",
            })
          )[0]!.name,
          "Current collector profile",
        );
        const cashKey = key(),
          body = record(500, [
            { chargeId: ca.id, version: 3, amountMinor: 500 },
          ]);
        assert.ok((await command(body, cashKey, "helper")).id);
        await access.save("owner", org, grant.id, null, {
          action: "revoke",
          version: 1,
        });
        assert.equal(
          (await command(body, cashKey, "helper")).code,
          "forbidden",
        );
        assert.equal(
          (await cash.summary("other", other, activity, session)).length,
          0,
        );
      },
    );
    await t.test(
      "API scopes pagination, rejects forged inputs and prevents attendance-only access",
      async () => {
        const path = `https://himmah.test/api/organizations/${org}/activities/${activity}/sessions/${session}/cash`,
          user = { id: "owner", emailVerified: true };
        const response = (await cashApi(
          new Request(path + "?limit=1"),
          user,
          organizations,
          cash,
        ))!;
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        const first = (await response.json()) as any;
        assert.ok(first.nextCursor);
        const second = (await (await cashApi(
          new Request(
            path + "?limit=1&cursor=" + encodeURIComponent(first.nextCursor),
          ),
          user,
          organizations,
          cash,
        ))!.json()) as any;
        assert.notEqual(first.items[0].id, second.items[0].id);
        assert.equal(
          (await cashApi(
            new Request(
              path +
                "?view=paid&cursor=" +
                encodeURIComponent(first.nextCursor),
            ),
            user,
            organizations,
            cash,
          ))!.status,
          400,
        );
        assert.equal(
          (await cashApi(
            new Request(path),
            { id: "attendance", emailVerified: true },
            organizations,
            cash,
          ))!.status,
          403,
        );
        assert.equal(
          (await cashApi(
            new Request(path),
            { ...user, emailVerified: false },
            organizations,
            cash,
          ))!.status,
          403,
        );
        assert.equal(
          (await cashApi(
            new Request(path, {
              method: "POST",
              body: JSON.stringify({
                key: key(),
                action: "record",
                amountMinor: -1,
              }),
            }),
            user,
            organizations,
            cash,
          ))!.status,
          400,
        );
      },
    );
    await t.test(
      "audit failure rolls back receipt, allocations and request receipt together",
      async () => {
        await db.exec(
          `create function cash_test_fail() returns trigger language plpgsql as $$ begin raise exception 'Audit blocked'; end; $$;create trigger cash_test_fail before insert on hub_directory_audit for each row execute function cash_test_fail();`,
        );
        const before = Number(
            (
              await db.query<any>(
                "select count(*)::int n from hub_cash_receipts",
              )
            ).rows[0]!.n,
          ),
          k = key();
        await assert.rejects(
          command(
            record(500, [{ chargeId: cb.id, version: 4, amountMinor: 500 }]),
            k,
          ),
        );
        assert.equal(
          (await db.query<any>("select count(*)::int n from hub_cash_receipts"))
            .rows[0]!.n,
          before,
        );
        assert.equal(
          (
            await db.query<any>(
              "select count(*)::int n from hub_cash_requests where request_key=$1",
              [k],
            )
          ).rows[0]!.n,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
test("cash upgrade preserves charges and keeps existing attendance grants cash-disabled", async () => {
  const { readFile } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process");
  const { cashPlan } = await import("../scripts/cash-plan.mjs");
  const db = new PGlite();
  try {
    for (const file of [
      "0000_brave_thunderbird.sql",
      "0001_session_registration.sql",
      "0002_session_pricing.sql",
    ])
      await db.exec(await readFile("db/migrations/generated/" + file, "utf8"));
    for (const name of ["contacts", "directory", "communication", "hosting"])
      await db.exec(await readFile("db/rebuild/" + name + ".sql", "utf8"));
    for (const name of [
      "people-adapter",
      "access",
      "attendance",
      "notifications",
      "registration",
      "pricing",
    ])
      await db.exec(
        execFileSync(
          "git",
          ["show", "e0f0cba:db/migrations/functions/" + name + ".sql"],
          { encoding: "utf8" },
        ),
      );
    const org = crypto.randomUUID(),
      activity = crypto.randomUUID(),
      session = crypto.randomUUID(),
      person = crypto.randomUUID(),
      registration = crypto.randomUUID();
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Old cash baseline','old-cash-baseline','UTC','owner',gen_random_uuid())`,
      [org],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner'),($1,'attendance','volunteer')`,
      [org],
    );
    await db.query(
      `insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,'Existing','owner','owner')`,
      [person, org],
    );
    await db.query(
      `insert into hub_activities(id,organization_id,name,timezone,price_minor,created_by,creation_key)values($1,$2,'Existing paid','UTC',1000,'owner',gen_random_uuid())`,
      [activity, org],
    );
    await db.query(
      `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,price_minor,created_by,creation_key)values($1,$2,$3,'Existing paid','','','UTC',now()+interval '1 day',now()+interval '25 hours',1000,'owner',gen_random_uuid())`,
      [session, org, activity],
    );
    await db.query(
      `insert into hub_session_registrations(id,organization_id,activity_id,session_id,person_id,status,source)values($1,$2,$3,$4,$5,'confirmed','advance')`,
      [registration, org, activity, session, person],
    );
    await db.query(
      `insert into hub_registration_charges(organization_id,registration_id,amount_minor,created_by)values($1,$2,1000,'owner')`,
      [org, registration],
    );
    await db.query(
      `select hub_save_access('owner',$1,null,gen_random_uuid(),$2::jsonb)`,
      [
        org,
        JSON.stringify({
          userId: "attendance",
          activityId: activity,
          groupId: null,
          canAttend: true,
        }),
      ],
    );
    const plan = await cashPlan();
    await db.exec("BEGIN");
    for (const sql of plan.statements.slice(1)) await db.exec(sql);
    await db.exec("COMMIT");
    assert.equal(
      (await db.query<any>("select amount_minor from hub_registration_charges"))
        .rows[0]!.amount_minor,
      1000,
    );
    assert.equal(
      (await db.query<any>("select can_collect from hub_volunteer_assignments"))
        .rows[0]!.can_collect,
      false,
    );
    assert.equal(
      (await db.query<any>("select count(*)::int n from hub_cash_receipts"))
        .rows[0]!.n,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          `select hub_can_collect_session('attendance',$1,$2,$3) as ok`,
          [org, activity, session],
        )
      ).rows[0]!.ok,
      false,
    );
  } finally {
    await db.close();
  }
});
