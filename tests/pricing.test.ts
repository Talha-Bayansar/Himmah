import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createRegistrationStore } from "../src/server/registration-store.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { pageInput } from "../src/community/contracts.ts";
import { priceFromText, pricingInput } from "../src/activities/contracts.ts";
test("money input uses bounded integer cents and accepts comma decimals", () => {
  assert.equal(priceFromText("10,25"), 1025);
  assert.equal(priceFromText("0.01"), 1);
  for (const value of ["", "1.001", "-1", "1e3", "1000000.01", "0"])
    assert.throws(() => priceFromText(value));
  for (const priceMinor of [-1, 0.1, Number.MAX_SAFE_INTEGER, "100"])
    assert.throws(() => pricingInput({ priceMinor }));
});
test("paid registration charges are atomic, immutable, tenant scoped and independent of attendance", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      run = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
      };
    const activities = createActivityStore("", run),
      registrations = createRegistrationStore("", run),
      people = createPeopleStore("", run),
      access = createAccessStore("", run);
    const org = crypto.randomUUID(),
      other = crypto.randomUUID(),
      key = () => crypto.randomUUID();
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Pricing','pricing','UTC','owner',$3),($2,'Other','pricing-other','UTC','other',$4)`,
      [org, other, key(), key()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role) values($1,'owner','owner'),($1,'helper','volunteer'),($2,'other','owner')`,
      [org, other],
    );
    const person = String(
      (
        await people.command("owner", org, "create", key(), {
          displayName: "Sample",
          givenName: null,
          familyName: null,
        })
      ).id,
    );
    const fields = {
      name: "Paid activity",
      description: "",
      location: "",
      timezone: "UTC",
      audienceGroupIds: [],
      priceMinor: 1000,
    };
    const activity = String(
      (await activities.create("owner", org, key(), fields))[0]!.id,
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
    assert.equal(
      (await activities.session("owner", org, activity, session))[0]!
        .priceMinor,
      1000,
    );
    await activities.update("owner", org, activity, 1, {
      ...fields,
      priceMinor: 2000,
    });
    assert.equal(
      (await activities.session("owner", org, activity, session))[0]!
        .priceMinor,
      1000,
    );
    const next = String(
      (
        await activities.createSession(
          "owner",
          org,
          activity,
          key(),
          2,
          schedule,
        )
      )[0]!.id,
    );
    assert.equal(
      (await activities.session("owner", org, activity, next))[0]!.priceMinor,
      2000,
    );
    const replayKey = key();
    const override = { ...schedule, priceMinor: 500 };
    const saved = await activities.createSession(
      "owner",
      org,
      activity,
      replayKey,
      2,
      override,
    );
    assert.equal(
      (
        await activities.createSession(
          "owner",
          org,
          activity,
          replayKey,
          2,
          override,
        )
      )[0]!.id,
      saved[0]!.id,
    );
    assert.deepEqual(
      await activities.createSession("owner", org, activity, replayKey, 2, {
        ...override,
        priceMinor: 600,
      }),
      [],
    );
    assert.deepEqual(
      await activities.createSession(
        "owner",
        org,
        activity,
        replayKey,
        2,
        schedule,
      ),
      [],
    );
    const payload = {
      action: "register",
      version: 0,
      personId: person,
      contactVersion: 1,
      sessionVersion: 1,
      reason: "",
    };
    const command = async (p: any, k = key(), actor = "owner", o = org) =>
      (await registrations.command(actor, o, activity, session, k, p))[0]!
        .result as any;
    assert.equal(
      (await command({ ...payload, sessionVersion: 999 })).code,
      "conflict",
    );
    const k = key(),
      result = await command(payload, k);
    assert.ok(result.id);
    assert.deepEqual(await command(payload, k), result);
    const count = async () =>
      (
        await db.query<any>(
          "select count(*)::int n from hub_registration_charges",
        )
      ).rows[0]!.n;
    assert.equal(await count(), 1);
    assert.equal(
      (await command({ ...payload, reason: "different" }, k)).code,
      "registration_key",
    );
    assert.equal((await command(payload, k, "other", other)).code, "not_found");
    assert.deepEqual(
      await activities.updateSession("owner", org, activity, session, 1, {
        ...schedule,
        priceMinor: 500,
      }),
      [],
    );
    const page = pageInput(new URL("https://himmah.test"), "pricing");
    let rows = await registrations.list(
      "owner",
      org,
      activity,
      session,
      page,
      "confirmed",
    );
    assert.deepEqual(rows[0]!.charge, {
      amountMinor: 1000,
      currency: "EUR",
      reviewRequired: false,
    });
    await access.save("owner", org, null, key(), {
      userId: "helper",
      groupId: null,
      activityId: activity,
      canAttend: true,
    });
    assert.equal(
      (
        await registrations.list(
          "helper",
          org,
          activity,
          session,
          page,
          "confirmed",
        )
      )[0]!.charge,
      null,
    );
    assert.equal(
      (
        await command({
          action: "cancel",
          personId: person,
          version: 1,
          reason: "Cannot attend",
        })
      ).version,
      2,
    );
    rows = await registrations.list(
      "owner",
      org,
      activity,
      session,
      page,
      "cancelled",
    );
    assert.equal((rows[0]!.charge as any).reviewRequired, true);
    assert.equal(
      (
        (await registrations.summary("owner", org, activity, session))[0]!
          .result as any
      ).chargeReviewCount,
      1,
    );
    assert.ok((await command({ ...payload, version: 2 })).id);
    assert.equal(await count(), 1);
    await assert.rejects(
      db.query(`update hub_registration_charges set amount_minor=1`),
    );
    await assert.rejects(
      db.query(
        `insert into hub_registration_charges(organization_id,registration_id,amount_minor,created_by) values($1,$2,100,'other')`,
        [other, result.id],
      ),
    );
    const free = String(
      (
        await activities.createSession("owner", org, activity, key(), 2, {
          ...schedule,
          priceMinor: 0,
        })
      )[0]!.id,
    );
    await registrations.command("owner", org, activity, free, key(), payload);
    assert.equal(await count(), 1);
    await db.exec(
      `create function pricing_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit blocked'; end; $$; create trigger pricing_fail_audit before insert on hub_directory_audit for each row execute function pricing_fail_audit();`,
    );
    await assert.rejects(
      registrations.command("owner", org, activity, next, key(), payload),
    );
    assert.equal(await count(), 1);
    assert.equal(
      (
        await db.query<any>(
          `select count(*)::int n from hub_session_registrations where session_id=$1`,
          [next],
        )
      ).rows[0]!.n,
      0,
    );
    assert.equal(
      (await db.query<any>("select count(*)::int n from hub_attendance"))
        .rows[0]!.n,
      0,
    );
  } finally {
    await db.close();
  }
});
test("pricing upgrade preserves existing free sessions and registrations without creating debt", async () => {
  const { readFile } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process");
  const { pricingPlan } = await import("../scripts/pricing-plan.mjs");
  const db = new PGlite();
  try {
    for (const file of [
      "0000_brave_thunderbird.sql",
      "0001_session_registration.sql",
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
    ])
      await db.exec(
        execFileSync(
          "git",
          ["show", "a18d556:db/migrations/functions/" + name + ".sql"],
          { encoding: "utf8" },
        ),
      );
    const org = crypto.randomUUID(),
      a = crypto.randomUUID(),
      s = crypto.randomUUID(),
      p = crypto.randomUUID();
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Legacy','legacy-pricing','UTC','owner',gen_random_uuid())`,
      [org],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')`,
      [org],
    );
    const people = createPeopleStore("", async (statement) => {
      const q = new PgDialect().sqlToQuery(statement);
      return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
    });
    const contact = String(
      (
        await people.command("owner", org, "create", crypto.randomUUID(), {
          displayName: "Existing",
          givenName: null,
          familyName: null,
        })
      ).id,
    );
    await db.query(
      `insert into hub_activities(id,organization_id,name,timezone,created_by,creation_key)values($1,$2,'Legacy session','UTC','owner',gen_random_uuid())`,
      [a, org],
    );
    await db.query(
      `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Legacy','','','UTC',now()+interval '1 day',now()+interval '25 hours','owner',gen_random_uuid())`,
      [s, org, a],
    );
    await db.query(
      `insert into hub_session_registrations(id,organization_id,activity_id,session_id,person_id,status,source)values($1,$2,$3,$4,$5,'confirmed','advance')`,
      [p, org, a, s, contact],
    );
    const plan = await pricingPlan();
    await db.exec("BEGIN");
    for (const sql of plan.statements.slice(1)) await db.exec(sql);
    await db.exec("COMMIT");
    assert.equal(
      (await db.query<any>("select price_minor from hub_activity_sessions"))
        .rows[0]!.price_minor,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from hub_registration_charges",
        )
      ).rows[0]!.n,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from hub_session_registrations",
        )
      ).rows[0]!.n,
      1,
    );
    await assert.rejects(
      db.query(`update hub_activity_sessions set price_minor=500 where id=$1`, [
        s,
      ]),
    );
  } finally {
    await db.close();
  }
});

test("registration upgrade plan includes current pricing dependencies for an older baseline", async () => {
  const { readFile } = await import("node:fs/promises");
  const { registrationPlan } = await import("../scripts/registration-plan.mjs");
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(
        "db/migrations/generated/0000_brave_thunderbird.sql",
        "utf8",
      ),
    );
    for (const name of ["contacts", "directory", "communication", "hosting"])
      await db.exec(await readFile("db/rebuild/" + name + ".sql", "utf8"));
    for (const name of [
      "people-adapter",
      "access",
      "attendance",
      "notifications",
    ])
      await db.exec(
        await readFile("db/migrations/functions/" + name + ".sql", "utf8"),
      );
    const plan = await registrationPlan();
    await db.exec("BEGIN");
    for (const sql of plan.statements.slice(1)) await db.exec(sql);
    await db.exec("COMMIT");
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from hub_registration_charges",
        )
      ).rows[0]!.n,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from information_schema.columns where table_name='hub_activity_sessions' and column_name='price_minor'",
        )
      ).rows[0]!.n,
      1,
    );
  } finally {
    await db.close();
  }
});
