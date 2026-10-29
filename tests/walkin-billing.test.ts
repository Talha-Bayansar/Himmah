import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createRegistrationStore } from "../src/server/registration-store.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { createCashStore } from "../src/server/cash-store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { pageInput } from "../src/community/contracts.ts";
test("paid drop-in participants can be charged and pay without any reservation", async (t) => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      run = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
      },
      key = () => crypto.randomUUID(),
      org = key();
    const people = createPeopleStore("", run),
      activities = createActivityStore("", run),
      attendance = createAttendanceStore("", run),
      registration = createRegistrationStore("", run),
      cash = createCashStore("", run),
      access = createAccessStore("", run);
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Drop in','paid-drop-in','UTC','owner',gen_random_uuid())`,
      [org],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner'),($1,'attendance','volunteer'),($1,'cash','volunteer')`,
      [org],
    );
    const create = async (name: string) =>
        String(
          (
            await people.command("owner", org, "create", key(), {
              displayName: name,
              givenName: null,
              familyName: null,
            })
          ).id,
        ),
      a = await create("Walk in A"),
      b = await create("Walk in B"),
      c = await create("Not billed");
    const activity = String(
      (
        await activities.create("owner", org, key(), {
          name: "Optional paid",
          description: "",
          location: "",
          timezone: "UTC",
          audienceGroupIds: [],
          priceMinor: 1000,
        })
      )[0]!.id,
    );
    const schedule = {
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: new Date(Date.now() + 90000000).toISOString(),
      location: "",
      timezone: "UTC",
    };
    const session = String(
      (
        await activities.createSession(
          "owner",
          org,
          activity,
          key(),
          1,
          schedule,
        )
      )[0]!.id,
    );
    await db.query(
      `update hub_activity_sessions set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=$1`,
      [session],
    );
    await access.save("owner", org, null, key(), {
      userId: "attendance",
      activityId: activity,
      groupId: null,
      canAttend: true,
      canCollect: false,
    });
    await access.save("owner", org, null, key(), {
      userId: "cash",
      activityId: activity,
      groupId: null,
      canAttend: false,
      canCollect: true,
    });
    const p = pageInput(new URL("https://himmah.test"), "walkin"),
      command = async (body: any, k = key(), actor = "owner", s = session) =>
        (await cash.command(actor, org, activity, s, k, body))[0]!
          .result as any;
    const count = async (table: string) =>
      (await db.query<any>(`select count(*)::int n from ${table}`)).rows[0]!.n;
    const add = (personId: string) => ({
      action: "charge",
      personId,
      contactVersion: 1,
      sessionVersion: 1,
    });
    const candidate = (personId: string, amountMinor: number) => ({
      personId,
      contactVersion: 1,
      sessionVersion: 1,
      version: 0,
      amountMinor,
    });
    let chargeA = "";
    await t.test(
      "attendance exposes an uncharged participant without silently adding debt or reservations",
      async () => {
        await attendance.save("owner", org, activity, session, {
          key: key(),
          status: "present",
          reason: "",
          items: [
            { personId: a, version: 0 },
            { personId: b, version: 0 },
          ],
        });
        const rows = await cash.list("owner", org, activity, session, p, "all");
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.status, "not_charged");
        assert.equal(
          (await cash.summary("owner", org, activity, session))[0]!.owedMinor,
          0,
        );
        const own = await attendance.list(
          "owner",
          org,
          activity,
          session,
          p,
          "all",
        );
        assert.equal(
          (own.find((x) => x.id === a)!.billing as any).status,
          "not_charged",
        );
        const limited = await attendance.list(
          "attendance",
          org,
          activity,
          session,
          p,
          "all",
        );
        assert.equal(limited.find((x) => x.id === a)!.billing, null);
        assert.equal(await count("hub_registration_charges"), 0);
        assert.equal(await count("hub_session_registrations"), 0);
      },
    );
    await t.test(
      "explicit charge without payment creates one session-person principal and no booking",
      async () => {
        const k = key(),
          body = add(a),
          result = await command(body, k);
        assert.ok(result.id);
        chargeA = result.id;
        assert.deepEqual(await command(body, k), result);
        assert.equal((await command(body)).code, "conflict");
        assert.equal(await count("hub_registration_charges"), 1);
        assert.equal(await count("hub_cash_receipts"), 0);
        assert.equal(await count("hub_session_registrations"), 0);
        assert.equal(
          (await cash.summary("owner", org, activity, session))[0]!.owedMinor,
          1000,
        );
        const row = (await cash.person("owner", org, activity, session, a))[0]!
          .item as any;
        assert.equal(row.status, "unpaid");
        assert.equal(row.id, chargeA);
      },
    );
    await t.test(
      "cash save atomically adds a missing walk-in charge and splits one payment without a reservation",
      async () => {
        const body = {
            action: "record",
            amountMinor: 1500,
            payerLabel: "Family",
            occurredAt: new Date().toISOString(),
            allocations: [
              { chargeId: chargeA, version: 1, amountMinor: 1000 },
              candidate(b, 500),
            ],
          },
          k = key();
        const result = await command(body, k);
        assert.ok(result.id);
        assert.deepEqual(await command(body, k), result);
        assert.equal(await count("hub_registration_charges"), 2);
        assert.equal(await count("hub_cash_receipts"), 1);
        assert.equal(await count("hub_session_registrations"), 0);
        const rows = await cash.list("owner", org, activity, session, p, "all");
        assert.equal(rows.find((r) => r.personId === a)!.status, "paid");
        assert.equal(rows.find((r) => r.personId === b)!.status, "partial");
        const history = await cash.history("owner", org, activity, session, p);
        assert.equal((history[0]!.allocations as any[]).length, 2);
        assert.equal(
          (
            (await registration.summary("owner", org, activity, session))[0]!
              .result as any
          ).expected,
          null,
        );
      },
    );
    await t.test(
      "failed combined payments roll back new debt, while stale or unauthorized fee proposals cannot write",
      async () => {
        const body = {
          action: "record",
          amountMinor: 1500,
          payerLabel: "",
          occurredAt: new Date().toISOString(),
          allocations: [candidate(c, 1500)],
        };
        assert.equal((await command(body)).code, "cash_allocation");
        assert.equal(await count("hub_registration_charges"), 2);
        assert.equal(await count("hub_cash_receipts"), 1);
        assert.equal(
          (await command({ ...add(c), sessionVersion: 999 })).code,
          "conflict",
        );
        assert.equal(
          (await command(add(c), key(), "attendance")).code,
          "forbidden",
        );
        assert.equal(await count("hub_session_registrations"), 0);
      },
    );
    await t.test(
      "adding a reservation later reuses the walk-in principal instead of charging twice",
      async () => {
        const result = (
          await registration.command("owner", org, activity, session, key(), {
            action: "register",
            personId: a,
            version: 0,
            contactVersion: 1,
            sessionVersion: 1,
            reason: "",
          })
        )[0]!.result as any;
        assert.ok(result.id);
        assert.equal(await count("hub_registration_charges"), 2);
        await registration.command("owner", org, activity, session, key(), {
          action: "cancel",
          personId: a,
          version: 1,
          reason: "Reservation not needed",
        });
        assert.equal(
          (
            (await cash.person("owner", org, activity, session, a))[0]!
              .item as any
          ).reviewRequired,
          false,
        );
      },
    );
    await t.test(
      "registration-required policies remain enforced and free sessions cannot be charged",
      async () => {
        const required = String(
          (
            await activities.createSession(
              "owner",
              org,
              activity,
              key(),
              1,
              schedule,
            )
          )[0]!.id,
        );
        await registration.command("owner", org, activity, required, key(), {
          action: "configure",
          version: 0,
          mode: "required",
          capacity: 2,
        });
        assert.equal(
          (await command(add(c), key(), "owner", required)).code,
          "billing_registration_required",
        );
        const offer = (
          await cash.person("owner", org, activity, required, c)
        )[0]!.item as any;
        assert.equal(offer.registrationRequired, true);
        assert.equal(offer.canCharge, false);
        const free = String(
          (
            await activities.createSession("owner", org, activity, key(), 1, {
              ...schedule,
              priceMinor: 0,
            })
          )[0]!.id,
        );
        assert.equal(
          (await command(add(c), key(), "owner", free)).code,
          "cash_closed",
        );
      },
    );
  } finally {
    await db.close();
  }
});
test("upgrade keeps existing principal IDs, allocations, balances and exact receipt retries intact", async () => {
  const { readFile } = await import("node:fs/promises"),
    { execFileSync } = await import("node:child_process"),
    { billingPlan } = await import("../scripts/billing-plan.mjs");
  const db = new PGlite();
  try {
    for (const file of [
      "0000_brave_thunderbird.sql",
      "0001_session_registration.sql",
      "0002_session_pricing.sql",
      "0003_session_cash.sql",
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
      "cash",
    ])
      await db.exec(
        execFileSync(
          "git",
          ["show", "e690068:db/migrations/functions/" + name + ".sql"],
          { encoding: "utf8" },
        ),
      );
    const org = crypto.randomUUID(),
      act = crypto.randomUUID(),
      session = crypto.randomUUID(),
      person = crypto.randomUUID(),
      charge = crypto.randomUUID(),
      reg = crypto.randomUUID(),
      request = crypto.randomUUID();
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Old paid','old-paid','UTC','owner',gen_random_uuid())`,
      [org],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')`,
      [org],
    );
    await db.query(
      `insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,'Existing payer','owner','owner')`,
      [person, org],
    );
    await db.query(
      `insert into hub_activities(id,organization_id,name,timezone,price_minor,created_by,creation_key)values($1,$2,'Paid activity','UTC',1000,'owner',gen_random_uuid())`,
      [act, org],
    );
    await db.query(
      `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,price_minor,created_by,creation_key)values($1,$2,$3,'Paid session','','','UTC',now()+interval '1 day',now()+interval '25 hours',1000,'owner',gen_random_uuid())`,
      [session, org, act],
    );
    await db.query(
      `insert into hub_session_registrations(id,organization_id,activity_id,session_id,person_id,status,source)values($1,$2,$3,$4,$5,'confirmed','advance')`,
      [reg, org, act, session, person],
    );
    await db.query(
      `insert into hub_registration_charges(id,organization_id,registration_id,amount_minor,created_by)values($1,$2,$3,1000,'owner')`,
      [charge, org, reg],
    );
    const payload = {
      action: "record",
      amountMinor: 1000,
      payerLabel: "Historical",
      occurredAt: new Date().toISOString(),
      allocations: [{ chargeId: charge, version: 1, amountMinor: 1000 }],
    };
    const old = (
      await db.query<any>(
        "select hub_cash_command($1,$2,$3,$4,$5,$6::jsonb) as result",
        ["owner", org, act, session, request, JSON.stringify(payload)],
      )
    ).rows[0]!.result;
    const plan = await billingPlan();
    await db.exec("BEGIN");
    for (const s of plan.statements.slice(1)) await db.exec(s);
    await db.exec("COMMIT");
    const row = (
      await db.query<any>(
        "select * from hub_registration_charges where id=$1",
        [charge],
      )
    ).rows[0]!;
    assert.equal(row.registration_id, reg);
    assert.equal(row.person_id, person);
    assert.equal(row.session_id, session);
    assert.equal(row.amount_minor, 1000);
    const replay = (
      await db.query<any>(
        "select hub_billing_command($1,$2,$3,$4,$5,$6::jsonb) as result",
        ["owner", org, act, session, request, JSON.stringify(payload)],
      )
    ).rows[0]!.result;
    assert.deepEqual(replay, old);
    assert.equal(
      (await db.query<any>("select count(*)::int n from hub_cash_receipts"))
        .rows[0]!.n,
      1,
    );
    assert.equal(
      (
        await db.query<any>("select hub_cash_balance($1,$2) as balance", [
          org,
          charge,
        ])
      ).rows[0]!.balance.paidMinor,
      1000,
    );
    await assert.rejects(
      db.query(
        "update hub_registration_charges set amount_minor=1 where id=$1",
        [charge],
      ),
    );
  } finally {
    await db.close();
  }
});
