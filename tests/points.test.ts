import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  pointsInput,
  type PointsInput,
  type PointsResult,
} from "../src/points/contracts.ts";
import { createPointsStore } from "../src/server/points-store.ts";
import { pointsApi } from "../src/server/points-api.ts";
import { pageInput, pageResult } from "../src/community/contracts.ts";
import type { OrganizationStore } from "../src/server/store.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const base = {
  key: crypto.randomUUID(),
  kind: "award",
  people: [crypto.randomUUID()],
  amount: 10,
  reason: "Helping prepare the room",
  occurredLocal: "2020-01-01T12:00",
  activityId: null,
  sessionId: null,
};
test("points inputs validate bounds, canonical recipients, reason, correction versions and occurrence dates", () => {
  const value = pointsInput(base, "UTC");
  assert.equal(value.occurredAt, "2020-01-01T12:00:00.000Z");
  for (const patch of [
    { amount: 0 },
    { amount: -1 },
    { amount: 1.2 },
    { amount: 10001 },
    { people: [] },
    { people: Array(51).fill(base.people[0]) },
    { people: [base.people[0], base.people[0]!.toUpperCase()] },
    { reason: "" },
    { reason: "x".repeat(301) },
    { occurredLocal: "2099-01-01T12:00" },
    { occurredLocal: "1999-01-01T12:00" },
    { sessionId: crypto.randomUUID() },
  ])
    assert.throws(() => pointsInput({ ...base, ...patch }, "UTC"));
  assert.throws(() =>
    pointsInput(
      { ...base, occurredLocal: "2026-03-29T02:30" },
      "Europe/Brussels",
    ),
  );
  assert.throws(() =>
    pointsInput(
      { ...base, kind: "correct", originalId: crypto.randomUUID(), version: 0 },
      "UTC",
    ),
  );
  assert.equal(
    pointsInput(
      {
        ...base,
        kind: "correct",
        originalId: crypto.randomUUID(),
        version: 1,
        amount: 0,
      },
      "UTC",
    ).amount,
    0,
  );
});
test("PostgreSQL points: tenant isolation, partial batches, immutable ledger, corrections, concurrent versions and retry receipts", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../db/migrations/generated/", import.meta.url),
      journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", dir), "utf8"),
      );
    for (const m of journal.entries)
      await db.exec(await readFile(new URL(m.tag + ".sql", dir), "utf8"));
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Test A','test-a','UTC','owner-a',$3),($2,'Test B','test-b','UTC','owner-b',$4)`,
      [org, other, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role,display_name) values($1,'owner-a','owner','Owner A'),($1,'admin-a','admin','Admin A'),($1,'volunteer-a','volunteer','Volunteer A'),($2,'owner-b','owner','Owner B')`,
      [org, other],
    );
    const member = crypto.randomUUID(),
      archived = crypto.randomUUID(),
      foreign = crypto.randomUUID();
    for (const [id, tenant, hidden] of [
      [member, org, false],
      [archived, org, true],
      [foreign, other, false],
    ] as const)
      await db.query(
        `insert into hub_people(id,organization_id,name,archived,created_by,creation_key,consent_recorded_by) values($1,$2,'Test nickname',$3,'owner-a',$4,'owner-a')`,
        [id, tenant, hidden, crypto.randomUUID()],
      );
    const dialect = new PgDialect();
    const store = createPointsStore(
      "postgresql://test:test@localhost/test",
      async (st) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
      },
    );
    const make = (patch: Record<string, unknown> = {}) =>
      pointsInput(
        { ...base, key: crypto.randomUUID(), people: [member], ...patch },
        "UTC",
      );
    const save = async (input: PointsInput, user = "owner-a", tenant = org) =>
      (await store.save(user, tenant, input))[0]!.result as PointsResult & {
        code?: string;
      };
    assert.equal((await save(make(), "volunteer-a")).code, "forbidden");
    assert.equal((await save(make(), "owner-b")).code, "forbidden");
    assert.equal((await store.member("owner-b", org, member)).length, 0);
    const input = make({ people: [member, archived, foreign] });
    const result = await save(input);
    assert.equal(result.items.filter((x) => x.outcome === "saved").length, 1);
    assert.equal(
      result.items.filter((x) => x.outcome === "ineligible").length,
      2,
    );
    assert.deepEqual(await save(input), result);
    assert.equal(
      (await save({ ...input, amount: 20 })).code,
      "points_key_conflict",
    );
    assert.equal((await save(input, "admin-a")).code, "points_key_conflict");
    assert.equal(
      (await store.member("owner-a", org, member))[0]!.balance,
      "10",
    );
    const page = pageInput(
      new URL("https://test.invalid?limit=1"),
      org + "/points",
    );
    let history = await store.history("owner-a", org, member, page);
    const original = history[0]!;
    const correction = make({
      kind: "correct",
      originalId: original.id,
      version: 1,
      amount: 4,
      reason: "Corrected the entered amount",
    });
    assert.equal((await save(correction)).items[0]!.outcome, "saved");
    assert.deepEqual(await save(input), result);
    assert.equal((await store.member("owner-a", org, member))[0]!.balance, "4");
    assert.equal(
      (await save({ ...correction, key: crypto.randomUUID(), amount: 7 }))
        .items[0]!.outcome,
      "conflict",
    );
    const [a, b] = await Promise.all([
      save(
        make({
          kind: "correct",
          originalId: original.id,
          version: 2,
          amount: 0,
          reason: "Reversed duplicate contribution",
        }),
      ),
      save(
        make({
          kind: "correct",
          originalId: original.id,
          version: 2,
          amount: 2,
          reason: "Concurrent correction",
        }),
      ),
    ]);
    assert.deepEqual([a.items[0]!.outcome, b.items[0]!.outcome].sort(), [
      "conflict",
      "saved",
    ]);
    history = await store.history("owner-a", org, member, page);
    assert.equal(history.length, 2);
    const firstPage = pageResult(
      history as { id: string; createdAt: string }[],
      page,
    );
    assert.ok(firstPage.nextCursor);
    const next = pageInput(
      new URL("https://test.invalid?limit=1&cursor=" + firstPage.nextCursor),
      org + "/points",
    );
    assert.notEqual(
      (await store.history("owner-a", org, member, next))[0]!.id,
      history[0]!.id,
    );
    await assert.rejects(
      db.query("update hub_points_entries set amount=999 where id=$1", [
        original.id,
      ]),
      /append-only/,
    );
    await assert.rejects(
      db.query("delete from hub_points_entries where id=$1", [original.id]),
      /append-only/,
    );
    const activity = crypto.randomUUID();
    await db.query(
      `insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key) values($1,$2,'Test activity','','','UTC','owner-a',$3)`,
      [activity, org, crypto.randomUUID()],
    );
    assert.equal(
      (await save(make({ activityId: activity }))).items[0]!.outcome,
      "saved",
    );
    assert.equal(
      (await save(make({ activityId: crypto.randomUUID() }))).code,
      "not_found",
    );
    const session = crypto.randomUUID();
    await db.query(
      `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key) values($1,$2,$3,'Linked session','','','UTC','2020-01-01T10:00Z','2020-01-01T11:00Z','owner-a',$4)`,
      [session, org, activity, crypto.randomUUID()],
    );
    const linked = make({ activityId: activity, sessionId: session });
    const [firstRetry, secondRetry] = await Promise.all([
      save(linked),
      save(linked),
    ]);
    assert.deepEqual(firstRetry, secondRetry);
    const linkedRows = await db.query<{ n: number }>(
      `select count(*)::int as n from hub_points_entries where session_id=$1`,
      [session],
    );
    assert.equal(linkedRows.rows[0]!.n, 1);
    assert.equal(
      (
        await save(
          make({ activityId: activity, sessionId: crypto.randomUUID() }),
        )
      ).code,
      "not_found",
    );
    await db.query("update hub_people set archived=true where id=$1", [member]);
    assert.equal((await save(make())).items[0]!.outcome, "ineligible");
    assert.equal((await store.member("owner-a", org, member)).length, 1);
    assert.deepEqual(await save(input), result);
    // Private HTTP boundary, including archived member history.
    const organizations = {
      get: async (user: string, tenant: string) =>
        tenant === org && ["owner-a", "volunteer-a"].includes(user)
          ? {
              id: org,
              timezone: "UTC",
              role: user === "owner-a" ? "owner" : "volunteer",
            }
          : null,
    } as unknown as OrganizationStore;
    const identity = { id: "owner-a", emailVerified: true };
    const request = (path: string, init?: RequestInit) =>
      new Request("https://test.invalid/api/organizations/" + org + path, init);
    assert.equal(
      (await pointsApi(
        request("/members/" + member),
        identity,
        organizations,
        store,
      ))!.status,
      200,
    );
    assert.equal(
      (await pointsApi(
        request("/members/" + member + "/points"),
        { ...identity, id: "volunteer-a" },
        organizations,
        store,
      ))!.status,
      403,
    );
    assert.equal(
      (await pointsApi(
        request("/members/" + member),
        { ...identity, emailVerified: false },
        organizations,
        store,
      ))!.status,
      403,
    );
    assert.equal(
      (await pointsApi(
        request("/members/" + foreign),
        identity,
        organizations,
        store,
      ))!.status,
      404,
    );
    assert.equal(
      (await pointsApi(
        request("/points", {
          method: "POST",
          body: JSON.stringify({ ...base, people: [] }),
        }),
        identity,
        organizations,
        store,
      ))!.status,
      400,
    );
    const response = await pointsApi(
      request("/points", {
        method: "POST",
        body: JSON.stringify({
          ...base,
          key: crypto.randomUUID(),
          people: [archived],
        }),
      }),
      identity,
      organizations,
      store,
    );
    assert.equal(response!.status, 200);
    assert.equal(response!.headers.get("cache-control"), "no-store");
  } finally {
    await db.close();
  }
});
