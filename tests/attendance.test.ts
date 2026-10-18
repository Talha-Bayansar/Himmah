import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { attendanceApi } from "../src/server/attendance-api.ts";
import { attendanceInput } from "../src/attendance/contracts.ts";
import { pageInput, pageResult } from "../src/community/contracts.ts";
import type { OrganizationStore } from "../src/server/store.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
test("attendance payload is bounded, deduplicated, canonical and validates correction inputs", () => {
  const id = crypto.randomUUID(),
    key = crypto.randomUUID(),
    body = {
      key,
      status: "present",
      reason: "",
      items: [{ personId: id, version: 0 }],
    };
  assert.equal(attendanceInput(body).status, "present");
  assert.throws(() =>
    attendanceInput({
      ...body,
      items: [
        { personId: id.toLowerCase(), version: 0 },
        { personId: id.toUpperCase(), version: 0 },
      ],
    }),
  );
  for (const invalid of [
    { ...body, status: "late" },
    { ...body, key: "bad" },
    { ...body, reason: "x".repeat(301) },
    { ...body, items: [] },
    { ...body, items: [body.items[0], body.items[0]] },
    { ...body, items: [{ personId: id, version: -1 }] },
    {
      ...body,
      items: Array.from({ length: 51 }, () => ({
        personId: crypto.randomUUID(),
        version: 0,
      })),
    },
  ])
    assert.throws(() => attendanceInput(invalid));
  const second = crypto.randomUUID();
  const input = attendanceInput({
    ...body,
    items: [{ personId: second, version: 0 }, body.items[0]],
  });
  assert.deepEqual(
    input.items.map((item) => item.personId),
    [id, second].sort(),
  );
});
test("PostgreSQL attendance: eligible pages, partial saves, receipts, conflicts, corrections, retained history and authorization", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../db/migrations/generated/", import.meta.url),
      journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", dir), "utf8"),
      );
    for (const migration of journal.entries)
      await db.exec(
        await readFile(new URL(migration.tag + ".sql", dir), "utf8"),
      );
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Test A','test-a','UTC','owner-a',$3),($2,'Test B','test-b','UTC','owner-b',$4)`,
      [org, other, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role,display_name) values($1,'owner-a','owner','Organizer A'),($1,'admin-a','admin','Admin A'),($1,'volunteer-a','volunteer','Volunteer A'),($2,'owner-b','owner','Organizer B')`,
      [org, other],
    );
    const activity = crypto.randomUUID(),
      session = crypto.randomUUID(),
      group = crypto.randomUUID();
    await db.query(
      `insert into hub_groups(id,organization_id,name,created_by,creation_key) values($1,$2,'Saved audience','owner-a',$3)`,
      [group, org, crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key) values($1,$2,'Test gathering','Learning','Main room','UTC','owner-a',$3)`,
      [activity, org, crypto.randomUUID()],
    );
    const makeSession = async (id: string, start: string, cancelled = false) =>
      db.query(
        `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,audience_group_ids,cancelled,created_by,creation_key) values($1,$2,$3,'Saved gathering','Saved details','Main room','UTC',$4::timestamptz,$4::timestamptz+interval '1 hour',ARRAY[$5]::uuid[],$6,'owner-a',$7)`,
        [id, org, activity, start, group, cancelled, crypto.randomUUID()],
      );
    await makeSession(session, "2020-01-01T10:00Z");
    const member = crypto.randomUUID(),
      second = crypto.randomUUID(),
      outside = crypto.randomUUID(),
      foreign = crypto.randomUUID(),
      others = Array.from({ length: 53 }, () => crypto.randomUUID());
    for (const [id, scope, name] of [
      [member, org, "Member One"],
      [second, org, "Member Two"],
      [outside, org, "Outside audience"],
      [foreign, other, "Foreign member"],
      ...others.map((id, i) => [id, org, "Roster " + i]),
    ] as string[][]) {
      await db.query(
        `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,$3,'owner-a',$4,'owner-a')`,
        [id, scope, name, crypto.randomUUID()],
      );
      if (scope === org && id !== outside)
        await db.query(
          `insert into hub_group_people(organization_id,group_id,person_id) values($1,$2,$3)`,
          [org, group, id],
        );
    }
    const dialect = new PgDialect(),
      execute = async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(statement);
        return (await db.query(q.sql, q.params)).rows as Record<
          string,
          unknown
        >[];
      };
    const store = createAttendanceStore(
        "postgresql://test:test@localhost/test",
        execute,
      ),
      activities = createActivityStore(
        "postgresql://test:test@localhost/test",
        execute,
      );
    const payload = (
      items: { personId: string; version: number }[],
      status = "present",
      reason = "",
      key = crypto.randomUUID(),
    ) => attendanceInput({ items, status, reason, key });
    const save = async (
      input: ReturnType<typeof payload>,
      user = "owner-a",
      sid = session,
    ) =>
      (await store.save(user, org, activity, sid, input))[0]!.result as {
        code?: string;
        items: {
          personId: string;
          outcome: string;
          status: string;
          version: number;
        }[];
      };
    const page = pageInput(
      new URL("https://test/?limit=25"),
      "owner-a:" + org + "/attendance/" + activity + "/" + session + "/all",
    );
    const first = pageResult(
      (await store.list("owner-a", org, activity, session, page, "all")) as {
        id: string;
        createdAt: string;
      }[],
      page,
    );
    assert.equal(first.items.length, 25);
    assert.ok(first.nextCursor);
    const next = pageInput(
      new URL("https://test/?limit=25&cursor=" + first.nextCursor),
      "owner-a:" + org + "/attendance/" + activity + "/" + session + "/all",
    );
    const nextRows = await store.list(
      "owner-a",
      org,
      activity,
      session,
      next,
      "all",
    );
    assert.equal(nextRows.length, 26);
    assert.ok(
      nextRows.every((row) => !first.items.some((item) => item.id === row.id)),
    );
    assert.equal(
      (await store.summary("owner-a", org, activity, session))[0]!.unmarked,
      55,
    );
    const input = payload([
      { personId: member, version: 0 },
      { personId: outside, version: 0 },
      { personId: foreign, version: 0 },
    ]);
    const result = await save(input);
    assert.equal(
      result.items.find((row) => row.personId === member)!.outcome,
      "saved",
    );
    assert.equal(
      result.items.filter((row) => row.outcome === "ineligible").length,
      2,
    );
    assert.deepEqual(await save(input), result);
    assert.equal(
      (await save({ ...input, status: "absent" })).code,
      "attendance_key_conflict",
    );
    assert.equal(
      (await save(input, "admin-a")).code,
      "attendance_key_conflict",
    );
    assert.equal(
      (await store.summary("owner-a", org, activity, session))[0]!.present,
      1,
    );
    assert.equal(
      (
        await save(
          payload([{ personId: member, version: 0 }], "absent", "Stale"),
        )
      ).items[0]!.outcome,
      "conflict",
    );
    const partial = await save(
      payload(
        [
          { personId: member, version: 1 },
          { personId: second, version: 0 },
        ],
        "absent",
      ),
    );
    assert.equal(
      partial.items.find((row) => row.personId === member)!.outcome,
      "reason_required",
    );
    assert.equal(
      partial.items.find((row) => row.personId === second)!.outcome,
      "saved",
    );
    assert.equal(
      (await save(payload([{ personId: member, version: 1 }], "present")))
        .items[0]!.outcome,
      "unchanged",
    );
    assert.equal(
      (
        await save(
          payload(
            [{ personId: member, version: 1 }],
            "excused",
            "Corrected check-in",
          ),
        )
      ).items[0]!.version,
      2,
    );
    assert.equal(
      (
        await save(
          payload(
            [{ personId: member, version: 2 }],
            "unmarked",
            "Remove mistaken entry",
          ),
        )
      ).items[0]!.version,
      3,
    );
    const historyInput = pageInput(
      new URL("https://test/?limit=1"),
      "history:" + member,
    );
    const hist = pageResult(
      (await store.history(
        "owner-a",
        org,
        activity,
        session,
        member,
        historyInput,
      )) as { id: string; createdAt: string }[],
      historyInput,
    );
    assert.ok(hist.nextCursor);
    assert.equal(
      (hist.items[0] as unknown as { reason: string }).reason,
      "Remove mistaken entry",
    );
    assert.equal(
      (
        await store.history(
          "owner-b",
          org,
          activity,
          session,
          member,
          historyInput,
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await store.history(
          "volunteer-a",
          org,
          activity,
          session,
          member,
          historyInput,
        )
      ).length,
      0,
    );
    assert.throws(() =>
      pageInput(
        new URL("https://test/?cursor=" + hist.nextCursor),
        "history:" + second,
      ),
    );
    await db.query(
      `delete from hub_group_people where organization_id=$1 and person_id=$2`,
      [org, member],
    );
    await db.query(
      `update hub_people set archived=true where organization_id=$1 and id=$2`,
      [org, second],
    );
    const retained = await store.list(
      "owner-a",
      org,
      activity,
      session,
      { ...page, query: "Member", limit: 50 },
      "all",
    );
    assert.equal(retained.length, 2);
    assert.ok(retained.every((row) => row.eligible === false));
    assert.equal(
      (
        await save(
          payload(
            [{ personId: second, version: 1 }],
            "present",
            "Correct archived record",
          ),
        )
      ).items[0]!.outcome,
      "saved",
    );
    assert.deepEqual(await save(input), result); // A late retry cannot overwrite a subsequent correction.
    assert.equal(
      (
        await store.list(
          "owner-a",
          org,
          activity,
          session,
          { ...page, query: "Member One" },
          "all",
        )
      )[0]!.status,
      "unmarked",
    );
    await db.query(
      `update hub_activities set audience_group_ids='{}'::uuid[] where id=$1`,
      [activity],
    );
    assert.equal(
      (await save(payload([{ personId: outside, version: 0 }]))).items[0]!
        .outcome,
      "ineligible",
    );
    const future = crypto.randomUUID(),
      cancelled = crypto.randomUUID();
    await makeSession(future, "2099-01-01T10:00Z");
    await makeSession(cancelled, "2020-02-01T10:00Z", true);
    assert.equal(
      (
        await save(
          payload([{ personId: others[0]!, version: 0 }]),
          "owner-a",
          future,
        )
      ).code,
      "attendance_not_started",
    );
    assert.equal(
      (
        await save(
          payload([{ personId: others[0]!, version: 0 }]),
          "owner-a",
          cancelled,
        )
      ).code,
      "attendance_cancelled",
    );
    assert.equal(
      (
        await save(
          payload([{ personId: others[0]!, version: 0 }]),
          "volunteer-a",
        )
      ).code,
      "forbidden",
    );
    assert.equal(
      (await save(payload([{ personId: others[0]!, version: 0 }]), "owner-b"))
        .code,
      "forbidden",
    );
    const race = await Promise.all([
      save(payload([{ personId: others[1]!, version: 0 }], "present")),
      save(payload([{ personId: others[1]!, version: 0 }], "absent")),
    ]);
    assert.deepEqual(race.map((result) => result.items[0]!.outcome).sort(), [
      "conflict",
      "saved",
    ]);
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::int as n from hub_attendance_changes where person_id=$1`,
          [member],
        )
      ).rows[0]!.n,
      3,
    );
    const organizations = {
      get: async (user: string, scope: string) =>
        scope === org && ["owner-a", "volunteer-a"].includes(user)
          ? {
              id: org,
              role: user === "owner-a" ? "owner" : "volunteer",
              timezone: "UTC",
            }
          : null,
    } as unknown as OrganizationStore;
    const call = async (
      user: string,
      method: string,
      suffix = "",
      value?: unknown,
      verified = true,
    ) =>
      attendanceApi(
        new Request(
          `https://test/api/organizations/${org}/activities/${activity}/sessions/${session}/attendance` +
            suffix,
          { method, ...(value ? { body: JSON.stringify(value) } : {}) },
        ),
        { id: user, emailVerified: verified },
        organizations,
        activities,
        store,
      );
    assert.equal((await call("volunteer-a", "GET"))!.status, 403);
    assert.equal((await call("owner-b", "GET"))!.status, 404);
    assert.equal(
      (await call("owner-a", "GET", "", undefined, false))!.status,
      403,
    );
    assert.equal((await call("owner-a", "GET", "?limit=51"))!.status, 400);
    assert.equal((await call("owner-a", "GET", "?status=bad"))!.status, 400);
    const api = await call("owner-a", "GET");
    assert.equal(api!.headers.get("Cache-Control"), "no-store");
    assert.equal(
      ((await api!.json()) as { items: unknown[] }).items.length,
      25,
    );
    assert.equal(
      (await call("owner-a", "POST", "", {
        key: crypto.randomUUID(),
        status: "present",
        reason: "",
        items: [],
      }))!.status,
      400,
    );
    assert.equal(
      (await call("owner-a", "GET", "/" + member + "/history"))!.status,
      200,
    );
  } finally {
    await db.close();
  }
});
