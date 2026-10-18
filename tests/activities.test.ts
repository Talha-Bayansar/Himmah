import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createActivityStore } from "../src/server/activity-store.ts";
import { activityApi } from "../src/server/activity-api.ts";
import { activityInput, zonedInstant } from "../src/activities/contracts.ts";
import { pageInput, pageResult } from "../src/community/contracts.ts";
import type { OrganizationStore } from "../src/server/store.ts";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const fields = {
  name: "Community learning",
  description: "Bring a notebook",
  location: "Main room",
  startLocal: "2026-11-06T18:00",
  endLocal: "2026-11-06T19:00",
};
test("activity times use organization timezone and reject DST gaps, ambiguity and invalid ranges", () => {
  assert.equal(
    zonedInstant("2026-11-06T18:00", "Europe/Brussels"),
    "2026-11-06T17:00:00.000Z",
  );
  assert.throws(() => zonedInstant("2026-03-29T02:30", "Europe/Brussels"));
  assert.throws(() => zonedInstant("2026-10-25T02:30", "Europe/Brussels"));
  assert.throws(() => zonedInstant("2026-02-30T12:00", "UTC"));
  assert.throws(() =>
    activityInput({ ...fields, endLocal: "2026-11-06T17:00" }, "UTC"),
  );
  assert.throws(() =>
    activityInput({ ...fields, endLocal: "2026-11-14T19:00" }, "UTC"),
  );
  assert.throws(() =>
    activityInput({ ...fields, description: "x".repeat(2001) }, "UTC"),
  );
});
test("persistent activities: scoped reads/writes, cursor pages, idempotency, version conflicts, cancellation and audit", async () => {
  const db = new PGlite();
  try {
    for (const file of [
      "0000_wild_iron_monger.sql",
      "0001_quiet_miracleman.sql",
      "0002_hesitant_thing.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../db/migrations/generated/" + file, import.meta.url),
          "utf8",
        ),
      );
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values ($1,'Test A','test-a','Europe/Brussels','owner-a',$3),($2,'Test B','test-b','UTC','owner-b',$4)`,
      [a, b, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role) values ($1,'owner-a','owner'),($1,'admin-a','admin'),($1,'volunteer-a','volunteer'),($2,'owner-b','owner')`,
      [a, b],
    );
    const dialect = new PgDialect();
    const store = createActivityStore(
      "postgresql://test:test@localhost/test",
      async (statement) => {
        const q = dialect.sqlToQuery(statement);
        return (await db.query(q.sql, q.params)).rows as Record<
          string,
          unknown
        >[];
      },
    );
    const v = activityInput(fields, "Europe/Brussels"),
      key = crypto.randomUUID();
    const first = (await store.create("owner-a", a, key, v))[0]!;
    assert.equal((await store.create("owner-a", a, key, v))[0]!.id, first.id);
    assert.equal(
      (await store.create("owner-a", a, key, { ...v, name: "Different" }))
        .length,
      0,
    );
    assert.equal(
      (await store.create("volunteer-a", a, crypto.randomUUID(), v)).length,
      0,
    );
    assert.equal(
      (await store.create("owner-b", a, crypto.randomUUID(), v)).length,
      0,
    );
    assert.equal((await store.get("owner-b", a, String(first.id))).length, 0);
    assert.equal((await store.get("owner-a", b, String(first.id))).length, 0);
    assert.equal(
      (await store.get("volunteer-a", a, String(first.id))).length,
      1,
    );
    await store.create("admin-a", a, crypto.randomUUID(), {
      ...v,
      name: "Second activity",
    });
    const input = pageInput(
      new URL("https://test/?limit=1"),
      "owner-a:" + a + "/activities",
    );
    const page = pageResult(
      (await store.list("owner-a", a, input)) as {
        id: string;
        createdAt: string;
      }[],
      input,
    );
    assert.equal(page.items.length, 1);
    assert.ok(page.nextCursor);
    const next = pageInput(
      new URL("https://test/?limit=1&cursor=" + page.nextCursor),
      "owner-a:" + a + "/activities",
    );
    const nextPage = await store.list("owner-a", a, next);
    assert.equal(nextPage.length, 1);
    assert.notEqual(nextPage[0]!.id, page.items[0]!.id);
    assert.throws(() =>
      pageInput(
        new URL("https://test/?limit=1&cursor=" + page.nextCursor),
        "volunteer-a:" + a + "/activities",
      ),
    );
    assert.equal(
      (
        await store.update("volunteer-a", a, String(first.id), 1, {
          ...v,
          name: "Blocked",
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await store.update("admin-a", a, String(first.id), 1, {
          ...v,
          name: "Updated activity",
        })
      )[0]!.version,
      2,
    );
    assert.equal(
      (await store.update("owner-a", a, String(first.id), 1, v)).length,
      0,
    );
    assert.equal(
      (await store.cancel("owner-b", a, String(first.id), 2)).length,
      0,
    );
    assert.equal(
      (await store.cancel("owner-a", a, String(first.id), 2))[0]!.cancelled,
      true,
    );
    assert.equal(
      (await store.update("owner-a", a, String(first.id), 3, v)).length,
      0,
    );
    assert.equal(
      (await store.cancel("owner-a", a, String(first.id), 2)).length,
      0,
    );
    const cancelled = await store.list("owner-a", a, {
      ...input,
      archived: true,
    });
    assert.equal(cancelled.length, 1);
    assert.equal(
      (await store.get("owner-a", a, String(first.id)))[0]!.cancelled,
      true,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from hub_directory_audit",
        )
      ).rows[0]!.n,
      4,
    );
    const organizations = {
      get: async (user: string, org: string) =>
        org === a && ["owner-a", "volunteer-a"].includes(user)
          ? {
              id: a,
              role: user === "owner-a" ? "owner" : "volunteer",
              timezone: "Europe/Brussels",
            }
          : null,
    } as unknown as OrganizationStore;
    const call = async (
      user: string,
      method: string,
      path = "",
      value?: unknown,
      verified = true,
    ) =>
      activityApi(
        new Request(
          "https://test/api/organizations/" + a + "/activities" + path,
          { method, ...(value ? { body: JSON.stringify(value) } : {}) },
        ),
        { id: user, emailVerified: verified },
        organizations,
        store,
      );
    assert.equal((await call("owner-b", "GET"))!.status, 404);
    assert.equal(
      (await call("volunteer-a", "POST", "", {
        ...fields,
        key: crypto.randomUUID(),
      }))!.status,
      403,
    );
    assert.equal(
      (await call(
        "owner-a",
        "POST",
        "",
        { ...fields, key: crypto.randomUUID() },
        false,
      ))!.status,
      403,
    );
    assert.equal((await call("owner-a", "GET", "?limit=51"))!.status, 400);
    assert.equal(
      (await call("owner-a", "POST", "", {
        ...fields,
        endLocal: fields.startLocal,
        key: crypto.randomUUID(),
      }))!.status,
      400,
    );
    assert.equal(
      (await call("owner-a", "POST", "", {
        ...fields,
        key: crypto.randomUUID(),
      }))!.status,
      201,
    );
    assert.equal(
      (await call("owner-a", "PATCH", "/" + first.id, {
        ...fields,
        version: 1,
      }))!.status,
      409,
    );
    assert.equal(
      (await call("volunteer-a", "GET", "/" + first.id))!.status,
      200,
    );
  } finally {
    await db.close();
  }
});
