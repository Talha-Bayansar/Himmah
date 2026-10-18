import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createActivityStore } from "../src/server/activity-store.ts";
import { activityApi } from "../src/server/activity-api.ts";
import {
  activityInput,
  sessionInput,
  zonedInstant,
} from "../src/activities/contracts.ts";
import { pageInput, pageResult } from "../src/community/contracts.ts";
import type { OrganizationStore } from "../src/server/store.ts";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const fields = {
  name: "Community learning",
  description: "Bring a notebook",
  location: "Main room",
  audienceGroupIds: [] as string[],
};
const times = {
  location: "Session room",
  startLocal: "2099-11-06T18:00",
  endLocal: "2099-11-06T19:00",
};
test("activity audience validation and session timezone/DST validation", () => {
  assert.throws(() =>
    sessionInput(
      {
        ...times,
        startLocal: "2020-01-01T10:00",
        endLocal: "2020-01-01T11:00",
      },
      "UTC",
    ),
  );
  assert.equal(
    zonedInstant("2026-11-06T18:00", "Europe/Brussels"),
    "2026-11-06T17:00:00.000Z",
  );
  for (const date of [
    "2026-03-29T02:30",
    "2026-10-25T02:30",
    "2026-02-30T12:00",
  ])
    assert.throws(() => zonedInstant(date, "Europe/Brussels"));
  assert.throws(() =>
    sessionInput({ ...times, endLocal: times.startLocal }, "UTC"),
  );
  assert.throws(() =>
    sessionInput({ ...times, endLocal: "2099-11-14T19:00" }, "UTC"),
  );
  assert.throws(() =>
    activityInput({ ...fields, description: "x".repeat(2001) }, "UTC"),
  );
  assert.throws(() =>
    activityInput({ ...fields, audienceGroupIds: [a, a] }, "UTC"),
  );
  assert.throws(() =>
    activityInput(
      {
        ...fields,
        audienceGroupIds: Array.from({ length: 21 }, () => crypto.randomUUID()),
      },
      "UTC",
    ),
  );
  assert.throws(() =>
    activityInput({ ...fields, audienceGroupIds: ["bad"] }, "UTC"),
  );
});
test("PostgreSQL sessions migration, isolation, audience snapshots, pagination, retries and protected history", async () => {
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
    const old = crypto.randomUUID();
    await db.query(
      `insert into hub_activities(id,organization_id,name,description,location,starts_at,ends_at,timezone,cancelled,created_by,creation_key) values ($1,$2,'Legacy gathering','Original description','Original room','2020-01-02T12:00Z','2020-01-02T13:00Z','UTC',true,'owner-a',$3)`,
      [old, a, crypto.randomUUID()],
    );
    await db.exec(
      await readFile(
        new URL(
          "../db/migrations/generated/0003_odd_vanisher.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const dialect = new PgDialect(),
      store = createActivityStore(
        "postgresql://test:test@localhost/test",
        async (statement) => {
          const q = dialect.sqlToQuery(statement);
          return (await db.query(q.sql, q.params)).rows as Record<
            string,
            unknown
          >[];
        },
      );
    const legacy = (await store.session("owner-a", a, old, old))[0]!;
    assert.equal(legacy.name, "Legacy gathering");
    assert.equal(legacy.cancelled, true);
    assert.equal(legacy.location, "Original room");
    assert.equal(legacy.description, "Original description");
    const group = crypto.randomUUID(),
      other = crypto.randomUUID(),
      archived = crypto.randomUUID();
    await db.query(
      `insert into hub_groups(id,organization_id,name,created_by,creation_key,archived) values ($1,$4,'Group A','owner-a',$6,false),($2,$5,'Group B','owner-b',$7,false),($3,$4,'Archived group','owner-a',$8,true)`,
      [
        group,
        other,
        archived,
        a,
        b,
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
      ],
    );
    const v = activityInput(
        { ...fields, audienceGroupIds: [group] },
        "Europe/Brussels",
      ),
      key = crypto.randomUUID();
    const first = (await store.create("owner-a", a, key, v))[0]!,
      id = String(first.id);
    assert.equal((first.groups as { name: string }[])[0]!.name, "Group A");
    assert.equal(first.nextSession, null);
    assert.equal((await store.create("owner-a", a, key, v))[0]!.id, id);
    assert.equal(
      (await store.create("owner-a", a, key, { ...v, name: "Different" }))
        .length,
      0,
    );
    for (const user of ["volunteer-a", "owner-b"])
      assert.equal(
        (await store.create(user, a, crypto.randomUUID(), v)).length,
        0,
      );
    for (const bad of [other, archived, crypto.randomUUID()])
      assert.equal(
        (
          await store.create("owner-a", a, crypto.randomUUID(), {
            ...v,
            audienceGroupIds: [bad],
          })
        ).length,
        0,
      );
    assert.equal((await store.get("owner-b", a, id)).length, 0);
    assert.equal((await store.get("owner-a", b, id)).length, 0);
    assert.equal((await store.get("volunteer-a", a, id)).length, 1);
    const sv = sessionInput(times, "Europe/Brussels"),
      sk = crypto.randomUUID();
    const session = (
        await store.createSession("admin-a", a, id, sk, 1, sv)
      )[0]!,
      sid = String(session.id);
    assert.deepEqual(session.audienceGroupIds, [group]);
    assert.equal(session.name, fields.name);
    assert.equal(session.location, times.location);
    assert.equal(
      (await store.createSession("admin-a", a, id, sk, 1, sv))[0]!.id,
      sid,
    );
    assert.equal(
      (
        await store.createSession("admin-a", a, id, sk, 1, {
          ...sv,
          location: "Mismatch",
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await store.createSession(
          "volunteer-a",
          a,
          id,
          crypto.randomUUID(),
          1,
          sv,
        )
      ).length,
      0,
    );
    assert.equal(
      (await store.createSession("owner-b", a, id, crypto.randomUUID(), 1, sv))
        .length,
      0,
    );
    assert.equal(
      (await store.createSession("owner-a", b, id, crypto.randomUUID(), 1, sv))
        .length,
      0,
    );
    assert.equal(
      (await store.get("owner-a", a, id))[0]!.nextSession !== null,
      true,
    );
    assert.equal((await store.update("volunteer-a", a, id, 1, v)).length, 0);
    assert.equal(
      (
        await store.update("owner-a", a, id, 1, {
          ...v,
          audienceGroupIds: [other],
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await store.update("owner-a", a, id, 1, {
          ...v,
          name: "New defaults",
          audienceGroupIds: [],
        })
      )[0]!.version,
      2,
    );
    assert.equal((await store.update("owner-a", a, id, 1, v)).length, 0);
    const saved = (await store.session("owner-a", a, id, sid))[0]!;
    assert.equal(saved.name, fields.name);
    assert.deepEqual(saved.audienceGroupIds, [group]);
    assert.equal(
      (await store.createSession("owner-a", a, id, crypto.randomUUID(), 1, sv))
        .length,
      0,
    );
    const second = (
      await store.createSession("owner-a", a, id, crypto.randomUUID(), 2, {
        ...sv,
        startsAt: "2099-12-01T17:00Z",
        endsAt: "2099-12-01T18:00Z",
      })
    )[0]!;
    assert.equal(second.name, "New defaults");
    assert.deepEqual(second.audienceGroupIds, []);
    const input = pageInput(
      new URL("https://test/?limit=1"),
      "owner-a:" + a + "/activities/" + id + "/sessions/upcoming",
    );
    const page = pageResult(
      (await store.sessions("owner-a", a, id, input, "upcoming")) as {
        id: string;
        createdAt: string;
        startsAt: string;
      }[],
      input,
      (row) => row.startsAt,
    );
    assert.equal(page.items[0]!.id, sid);
    assert.ok(page.nextCursor);
    const next = pageInput(
      new URL("https://test/?limit=1&cursor=" + page.nextCursor),
      "owner-a:" + a + "/activities/" + id + "/sessions/upcoming",
    );
    assert.equal(
      (await store.sessions("owner-a", a, id, next, "upcoming"))[0]!.id,
      second.id,
    );
    assert.throws(() =>
      pageInput(
        new URL("https://test/?limit=1&cursor=" + page.nextCursor),
        "owner-a:" + a + "/activities/" + id + "/sessions/past",
      ),
    );
    assert.equal(
      (await store.updateSession("owner-a", a, old, old, 1, sv)).length,
      0,
    );
    assert.equal(
      (await store.cancelSession("owner-a", a, old, old, 1, "Late")).length,
      0,
    );
    assert.equal(
      (
        await store.updateSession("owner-a", a, id, sid, 1, {
          ...sv,
          location: "Updated room",
        })
      )[0]!.version,
      2,
    );
    assert.equal(
      (await store.updateSession("owner-a", a, id, sid, 1, sv)).length,
      0,
    );
    assert.equal(
      (await store.cancelSession("owner-b", a, id, sid, 2, "Blocked")).length,
      0,
    );
    assert.equal(
      (
        await store.cancelSession("admin-a", a, id, sid, 2, "Room unavailable")
      )[0]!.cancellationReason,
      "Room unavailable",
    );
    assert.equal(
      (await store.cancelSession("admin-a", a, id, sid, 2, "Retry")).length,
      0,
    );
    assert.equal(
      (await store.session("volunteer-a", a, id, sid))[0]!.cancelled,
      true,
    );
    assert.equal((await store.session("owner-b", a, id, sid)).length, 0);
    assert.equal((await store.cancel("owner-a", a, id, 2))[0]!.cancelled, true);
    assert.equal(
      (await store.createSession("owner-a", a, id, crypto.randomUUID(), 3, sv))
        .length,
      0,
    );
    assert.equal(
      (await store.session("owner-a", a, id, String(second.id)))[0]!.cancelled,
      false,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from hub_directory_audit where action='session.create'",
        )
      ).rows[0]!.n,
      2,
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
        key: crypto.randomUUID(),
      }))!.status,
      201,
    );
    assert.equal(
      (await call("owner-a", "GET", "/" + id + "/sessions?view=invalid"))!
        .status,
      400,
    );
    assert.equal(
      (await call("owner-a", "GET", "/" + id + "/sessions?limit=51"))!.status,
      400,
    );
    assert.equal(
      (await call("volunteer-a", "POST", "/" + id + "/sessions", {
        ...times,
        key: crypto.randomUUID(),
        version: 3,
      }))!.status,
      403,
    );
    assert.equal(
      (await call("owner-a", "POST", "/" + id + "/sessions", {
        ...times,
        endLocal: times.startLocal,
        key: crypto.randomUUID(),
        version: 3,
      }))!.status,
      400,
    );
    assert.equal(
      (await call("volunteer-a", "GET", "/" + id + "/sessions/" + sid))!.status,
      200,
    );
    assert.equal(
      (await call("owner-a", "GET", "/" + old + "/sessions/" + sid))!.status,
      404,
    );
  } finally {
    await db.close();
  }
});
