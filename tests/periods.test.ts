import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createPeriodStore } from "../src/server/period-store.ts";
import { createPointsStore } from "../src/server/points-store.ts";
import { periodApi } from "../src/server/period-api.ts";
import { periodInput } from "../src/periods/contracts.ts";
import { pageInput, pageResult } from "../src/community/contracts.ts";
import type { OrganizationStore } from "../src/server/store.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
test("period dates validate real inclusive calendar windows", () => {
  assert.deepEqual(
    periodInput({
      name: "Spring",
      startDate: "2024-02-29",
      endDate: "2024-02-29",
    }),
    { name: "Spring", startDate: "2024-02-29", endDate: "2024-02-29" },
  );
  for (const patch of [
    { startDate: "2025-02-29" },
    { startDate: "1999-01-01" },
    { endDate: "2101-01-01" },
    { endDate: "2024-02-28" },
    { startDate: "2024-02-31" },
    { name: "x" },
  ])
    assert.throws(() =>
      periodInput({
        name: "Spring",
        startDate: "2024-02-29",
        endDate: "2024-03-01",
        ...patch,
      }),
    );
});
test("PostgreSQL periods: DST windows, corrected points, recorded attendance, scoped pagination and immutable closing snapshots", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../db/migrations/generated/", import.meta.url),
      journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", dir), "utf8"),
      );
    for (const m of journal.entries)
      await db.exec(await readFile(new URL(m.tag + ".sql", dir), "utf8"));
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Test A','test-a','Europe/Brussels','owner-a',$3),($2,'Test B','test-b','UTC','owner-b',$4)`,
      [org, other, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role) values($1,'owner-a','owner'),($1,'admin-a','admin'),($1,'volunteer-a','volunteer'),($2,'owner-b','owner')`,
      [org, other],
    );
    const person = crypto.randomUUID(),
      second = crypto.randomUUID(),
      foreign = crypto.randomUUID(),
      group = crypto.randomUUID(),
      foreignGroup = crypto.randomUUID(),
      activity = crypto.randomUUID(),
      session = crypto.randomUUID();
    for (const [id, tenant] of [
      [person, org],
      [second, org],
      [foreign, other],
    ])
      await db.query(
        `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,'Test member','owner-a',$3,'owner-a')`,
        [id, tenant, crypto.randomUUID()],
      );
    for (const [id, tenant] of [
      [group, org],
      [foreignGroup, other],
    ])
      await db.query(
        `insert into hub_groups(id,organization_id,name,created_by,creation_key) values($1,$2,'Original group','owner-a',$3)`,
        [id, tenant, crypto.randomUUID()],
      );
    await db.query(
      `insert into hub_group_people(organization_id,group_id,person_id) values($1,$2,$3),($1,$2,$4)`,
      [org, group, person, second],
    );
    await db.query(
      `insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key) values($1,$2,'Gathering','','','Europe/Brussels','owner-a',$3)`,
      [activity, org, crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key) values($1,$2,$3,'Gathering','','','Europe/Brussels','2026-03-29T08:00Z','2026-03-29T09:00Z','owner-a',$4)`,
      [session, org, activity, crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_attendance(organization_id,activity_id,session_id,person_id,status) values($1,$2,$3,$4,'present')`,
      [org, activity, session, person],
    );
    const dialect = new PgDialect(),
      execute = async (st: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
      };
    const store = createPeriodStore(
        "postgresql://test:test@localhost/test",
        execute,
      ),
      points = createPointsStore(
        "postgresql://test:test@localhost/test",
        execute,
      );
    const save = async (
      payload: Record<string, unknown>,
      id: string | null = null,
      key: string | null = crypto.randomUUID(),
      user = "owner-a",
    ) =>
      (await store.save(user, org, id, key, payload))[0]!.result as {
        id?: string;
        code?: string;
      };
    const fields = {
        name: "Spring day",
        startDate: "2026-03-29",
        endDate: "2026-03-29",
      },
      key = crypto.randomUUID();
    const created = await save(fields, null, key);
    assert.ok(created.id);
    const id = created.id!;
    assert.deepEqual(await save(fields, null, key), created);
    assert.equal((await save(fields, null, key, "admin-a")).code, "conflict");
    assert.equal(
      (await save(fields, null, null, "volunteer-a")).code,
      "forbidden",
    );
    for (const occurredAt of [
      "2026-03-28T22:59:59Z",
      "2026-03-28T23:00:00Z",
      "2026-03-29T21:59:59Z",
      "2026-03-29T22:00:00Z",
    ])
      await points.save("owner-a", org, {
        key: crypto.randomUUID(),
        kind: "award",
        people: [person],
        amount: 10,
        reason: "Contribution",
        occurredAt,
        activityId: null,
        sessionId: null,
        originalId: null,
        version: null,
      });
    const original = (
      await db.query<{ id: string }>(
        "select id from hub_points_entries where occurred_at='2026-03-28T23:00:00Z' and original_id is null",
      )
    ).rows[0]!.id;
    await points.save("owner-a", org, {
      key: crypto.randomUUID(),
      kind: "correct",
      people: [person],
      amount: 4,
      reason: "Corrected amount",
      occurredAt: null,
      activityId: null,
      sessionId: null,
      originalId: original,
      version: 1,
    });
    let summary = (await store.summary("owner-a", org, id))[0]!;
    assert.equal(summary.points, "14");
    assert.equal(summary.present, 1);
    assert.equal(summary.absent, 0);
    assert.equal(summary.members, 2);
    const query = pageInput(
      new URL("https://test.invalid?limit=1"),
      org + "/report",
    );
    const members = await store.members("owner-a", org, id, query);
    const page = pageResult(
      members as { id: string; createdAt: string }[],
      query,
    );
    assert.ok(page.nextCursor);
    const next = pageInput(
      new URL("https://test.invalid?limit=1&cursor=" + page.nextCursor),
      org + "/report",
    );
    assert.notEqual(
      (await store.members("owner-a", org, id, next))[0]!.id,
      page.items[0]!.id,
    );
    assert.equal(
      (await store.groups("owner-a", org, id, query))[0]!.points,
      "14",
    );
    assert.equal((await store.get("owner-b", org, id)).length, 0);
    assert.equal(
      (await store.members("volunteer-a", org, id, query)).length,
      0,
    );
    assert.equal(
      (await store.group("owner-a", org, id, foreignGroup)).length,
      0,
    );
    assert.equal(
      (await save({ ...fields, action: "edit", version: 2 }, id)).code,
      "conflict",
    );
    const overlaps = await save({ ...fields, name: "Overlapping view" });
    assert.equal(
      (await store.summary("owner-a", org, overlaps.id!))[0]!.points,
      "14",
    );
    assert.equal((await save({ action: "close", version: 1 }, id)).id, id);
    assert.equal((await save({ action: "close", version: 1 }, id)).id, id);
    const closeAudits = await db.query<{ n: number }>(
      "select count(*)::int as n from hub_directory_audit where action='period.close' and entity_id=$1",
      [id],
    );
    assert.equal(closeAudits.rows[0]!.n, 1);
    const frozen = (await store.members("owner-a", org, id, query)).map(
      (x) => ({ ...x }),
    );
    await db.query(
      `update hub_people set name='Renamed',archived=true where id=$1`,
      [person],
    );
    await db.query(`update hub_groups set name='Renamed group' where id=$1`, [
      group,
    ]);
    await db.query(`delete from hub_group_people where person_id=$1`, [person]);
    await db.query(
      `update hub_attendance set status='absent' where person_id=$1`,
      [person],
    );
    await points.save("owner-a", org, {
      key: crypto.randomUUID(),
      kind: "award",
      people: [second],
      amount: 5,
      reason: "Late record",
      occurredAt: "2026-03-29T12:00Z",
      activityId: null,
      sessionId: null,
      originalId: null,
      version: null,
    });
    await points.save("owner-a", org, {
      key: crypto.randomUUID(),
      kind: "correct",
      people: [person],
      amount: 2,
      reason: "Late correction",
      occurredAt: null,
      activityId: null,
      sessionId: null,
      originalId: original,
      version: 2,
    });
    assert.deepEqual(await store.members("owner-a", org, id, query), frozen);
    summary = (await store.summary("owner-a", org, id))[0]!;
    assert.equal(summary.points, "14");
    assert.equal(summary.present, 1);
    assert.equal(
      (await store.summary("owner-a", org, overlaps.id!))[0]!.points,
      "17",
    );
    assert.equal(
      (await store.groups("owner-a", org, id, query))[0]!.name,
      "Original group",
    );
    assert.equal(
      (await store.summary("owner-a", org, id, group))[0]!.points,
      "14",
    );
    assert.equal(
      (await save({ ...fields, action: "edit", version: 2 }, id)).code,
      "period_closed",
    );
    await assert.rejects(
      db.query("update hub_period_members set points=999 where period_id=$1", [
        id,
      ]),
      /immutable/,
    );
    await assert.rejects(
      db.query("update hub_engagement_periods set name='Changed' where id=$1", [
        id,
      ]),
      /immutable/,
    );
    const organizations = {
        get: async (user: string, tenant: string) =>
          tenant === org && ["owner-a", "volunteer-a"].includes(user)
            ? {
                id: org,
                role: user === "owner-a" ? "owner" : "volunteer",
                timezone: "Europe/Brussels",
              }
            : null,
      } as unknown as OrganizationStore,
      identity = { id: "owner-a", emailVerified: true };
    const request = (path: string, init?: RequestInit) =>
      new Request(
        "https://test.invalid/api/organizations/" + org + "/periods" + path,
        init,
      );
    const detail = await periodApi(
      request("/" + id),
      identity,
      organizations,
      store,
    );
    assert.equal(detail!.status, 200);
    assert.equal(detail!.headers.get("cache-control"), "no-store");
    assert.ok((await detail!.json()).item.closedAt);
    assert.equal(
      (await periodApi(
        request("/" + id + "/members"),
        { ...identity, id: "volunteer-a" },
        organizations,
        store,
      ))!.status,
      403,
    );
    assert.equal(
      (await periodApi(
        request("/" + id),
        { ...identity, emailVerified: false },
        organizations,
        store,
      ))!.status,
      403,
    );
    assert.equal(
      (await periodApi(
        request("/" + id + "/members?group=" + foreignGroup),
        identity,
        organizations,
        store,
      ))!.status,
      404,
    );
    assert.equal(
      (await periodApi(
        request("", {
          method: "POST",
          body: JSON.stringify({
            ...fields,
            key: crypto.randomUUID(),
            endDate: "bad",
          }),
        }),
        identity,
        organizations,
        store,
      ))!.status,
      400,
    );
  } finally {
    await db.close();
  }
});
