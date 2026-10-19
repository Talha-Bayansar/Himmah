import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createPointsStore } from "../src/server/points-store.ts";
import { attendanceApi } from "../src/server/attendance-api.ts";
import { activityInput } from "../src/activities/contracts.ts";
import type { OrganizationStore } from "../src/server/store.ts";
import type {
  AttendanceInput,
  AttendanceResult,
} from "../src/attendance/contracts.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
test("attendance earning amounts are optional, bounded whole numbers", () => {
  const body = {
    name: "Gathering",
    description: "",
    location: "",
    audienceGroupIds: [],
  };
  for (const attendancePoints of [-1, 0.5, 10001, "10"])
    assert.throws(() => activityInput({ ...body, attendancePoints }, "UTC"));
  assert.equal(
    activityInput({ ...body, attendancePoints: 12 }, "UTC").attendancePoints,
    12,
  );
  assert.equal(activityInput(body, "UTC").attendancePoints ?? 0, 0);
});
test("PostgreSQL attendance rules: snapshots, read-only preview, atomic awards/reversals/restoration, receipts and manual correction protection", async () => {
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
      `insert into hub_memberships(organization_id,user_id,role) values($1,'owner-a','owner'),($1,'admin-a','admin'),($1,'volunteer-a','volunteer'),($2,'owner-b','owner')`,
      [org, other],
    );
    const person = crypto.randomUUID(),
      foreign = crypto.randomUUID();
    for (const [id, tenant] of [
      [person, org],
      [foreign, other],
    ])
      await db.query(
        `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,'Test member','owner-a',$3,'owner-a')`,
        [id, tenant, crypto.randomUUID()],
      );
    const dialect = new PgDialect(),
      execute = async (st: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
      };
    const activities = createActivityStore(
        "postgresql://test:test@localhost/test",
        execute,
      ),
      attendance = createAttendanceStore(
        "postgresql://test:test@localhost/test",
        execute,
      ),
      points = createPointsStore(
        "postgresql://test:test@localhost/test",
        execute,
      );
    const fields = {
      name: "Gathering",
      description: "",
      location: "",
      timezone: "UTC",
      audienceGroupIds: [],
      attendancePoints: 10,
    };
    const [activity] = await activities.create(
      "owner-a",
      org,
      crypto.randomUUID(),
      fields,
    );
    const activityId = String(activity!.id);
    const [future] = await activities.createSession(
      "owner-a",
      org,
      activityId,
      crypto.randomUUID(),
      1,
      {
        location: "",
        startsAt: "2099-01-01T10:00Z",
        endsAt: "2099-01-01T11:00Z",
        timezone: "UTC",
      },
    );
    assert.equal(future!.attendancePoints, 10);
    assert.equal(future!.earningRuleVersion, 1);
    await activities.update("owner-a", org, activityId, 1, {
      ...fields,
      attendancePoints: 25,
    });
    assert.equal(
      (
        await activities.session("owner-a", org, activityId, String(future!.id))
      )[0]!.attendancePoints,
      10,
    );
    const [later] = await activities.createSession(
      "owner-a",
      org,
      activityId,
      crypto.randomUUID(),
      2,
      {
        location: "",
        startsAt: "2099-01-02T10:00Z",
        endsAt: "2099-01-02T11:00Z",
        timezone: "UTC",
      },
    );
    assert.equal(later!.attendancePoints, 25);
    assert.equal(later!.earningRuleVersion, 2);
    await assert.rejects(
      db.query(
        "update hub_activity_sessions set attendance_points=99 where id=$1",
        [future!.id],
      ),
      /immutable/,
    );
    const session = crypto.randomUUID(),
      none = crypto.randomUUID();
    for (const [id, amount] of [
      [session, 10],
      [none, 0],
    ])
      await db.query(
        `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,attendance_points,earning_rule_version,created_by,creation_key) values($1,$2,$3,'Saved gathering','','','UTC','2020-01-01T10:00Z','2020-01-01T11:00Z',$4,1,'owner-a',$5)`,
        [id, org, activityId, amount, crypto.randomUUID()],
      );
    const input: AttendanceInput = {
      key: crypto.randomUUID(),
      status: "present",
      reason: "",
      items: [
        { personId: person, version: 0 },
        { personId: foreign, version: 0 },
      ],
    };
    const save = async (v: AttendanceInput, id = session, user = "owner-a") =>
      (await attendance.save(user, org, activityId, id, v))[0]!
        .result as AttendanceResult & { code?: string };
    const preview = (
      await attendance.preview("owner-a", org, activityId, session, input)
    )[0]!.result as AttendanceResult;
    assert.equal(
      preview.items.find((x) => x.personId === person)!.pointsDelta,
      10,
    );
    assert.equal(
      preview.items.find((x) => x.personId === foreign)!.outcome,
      "ineligible",
    );
    const counts = async () =>
      (
        await db.query<{ n: number }>(
          `select ((select count(*) from hub_attendance)+(select count(*) from hub_attendance_requests)+(select count(*) from hub_points_entries)+(select count(*) from hub_points_requests))::int as n`,
        )
      ).rows[0]!.n;
    assert.equal(await counts(), 0);
    assert.equal((await save(input)).code, "earning_review_required");
    assert.equal(await counts(), 0);
    assert.equal(
      (await save({ ...input, confirmPoints: true }, session, "volunteer-a"))
        .code,
      "forbidden",
    );
    const confirmed = { ...input, confirmPoints: true as const };
    const result = await save(confirmed);
    assert.equal(
      result.items.find((x) => x.personId === person)!.pointsDelta,
      10,
    );
    assert.deepEqual(await save(confirmed), result);
    assert.equal(
      (await points.member("owner-a", org, person))[0]!.balance,
      "10",
    );
    const next = (
      status: AttendanceInput["status"],
      version: number,
      reason = "Correction",
    ): AttendanceInput => ({
      key: crypto.randomUUID(),
      confirmPoints: true,
      status,
      reason,
      items: [{ personId: person, version }],
    });
    assert.equal(
      (await save(next("present", 1))).items[0]!.outcome,
      "unchanged",
    );
    assert.equal((await save(next("absent", 0))).items[0]!.outcome, "conflict");
    assert.equal(
      (await save(next("absent", 1, ""))).items[0]!.outcome,
      "reason_required",
    );
    const reverse = next("absent", 1);
    const revPreview = (
      await attendance.preview("owner-a", org, activityId, session, reverse)
    )[0]!.result as AttendanceResult;
    assert.equal(revPreview.items[0]!.pointsDelta, -10);
    assert.equal(
      (await points.member("owner-a", org, person))[0]!.balance,
      "10",
    );
    assert.equal((await save(reverse)).items[0]!.pointsDelta, -10);
    assert.equal(
      (await points.member("owner-a", org, person))[0]!.balance,
      "0",
    );
    const restore = next("present", 2);
    const [r1, r2] = await Promise.all([save(restore), save(restore)]);
    assert.deepEqual(r1, r2);
    assert.equal(
      (await points.member("owner-a", org, person))[0]!.balance,
      "10",
    );
    assert.deepEqual(await save(confirmed), result);
    const roots = (
      await db.query<{ n: number }>(
        `select count(*)::int as n from hub_attendance_awards`,
      )
    ).rows[0]!.n;
    assert.equal(roots, 1);
    const original = (
      await db.query<{
        id: string;
        source: string;
        rule_version: number;
        occurred_at: string;
      }>(
        `select id,source,rule_version,occurred_at::text from hub_points_entries where original_id is null`,
      )
    ).rows[0]!;
    assert.equal(original.source, "attendance");
    assert.equal(original.rule_version, 1);
    assert.ok(original.occurred_at.startsWith("2020-01-01 10:00:00"));
    const managed = (
      await points.save("owner-a", org, {
        key: crypto.randomUUID(),
        kind: "correct",
        people: [person],
        amount: 999,
        reason: "Try direct edit",
        occurredAt: null,
        activityId: null,
        sessionId: null,
        originalId: original.id,
        version: 3,
      })
    )[0]!.result as { items: { outcome: string }[] };
    assert.equal(managed.items[0]!.outcome, "managed");
    assert.equal(
      (await points.member("owner-a", org, person))[0]!.balance,
      "10",
    );
    const attendanceOnly = await save(
      {
        ...input,
        key: crypto.randomUUID(),
        items: [{ personId: person, version: 0 }],
      },
      none,
    );
    assert.equal(attendanceOnly.items[0]!.pointsDelta, 0);
    assert.equal(
      (await points.member("owner-a", org, person))[0]!.balance,
      "10",
    );
    const organizations = {
      get: async (user: string, id: string) =>
        id === org && ["owner-a", "volunteer-a"].includes(user)
          ? {
              id: org,
              role: user === "owner-a" ? "owner" : "volunteer",
              timezone: "UTC",
            }
          : null,
    } as unknown as OrganizationStore;
    const path = `https://test.invalid/api/organizations/${org}/activities/${activityId}/sessions/${session}/attendance/preview`;
    const req = () =>
      new Request(path, {
        method: "POST",
        body: JSON.stringify(next("absent", 3)),
      });
    assert.equal(
      (await attendanceApi(
        req(),
        { id: "owner-a", emailVerified: true },
        organizations,
        activities,
        attendance,
      ))!.status,
      200,
    );
    assert.equal(
      (await attendanceApi(
        req(),
        { id: "volunteer-a", emailVerified: true },
        organizations,
        activities,
        attendance,
      ))!.status,
      403,
    );
    assert.equal(
      (await attendanceApi(
        req(),
        { id: "owner-a", emailVerified: false },
        organizations,
        activities,
        attendance,
      ))!.status,
      403,
    );
    // A ledger failure must roll back attendance and its receipt too.
    await db.exec(
      `create function test_ledger_failure() returns trigger language plpgsql as $$ begin raise exception 'Injected ledger failure'; end; $$; create trigger test_ledger_failure before insert on hub_points_entries for each row execute function test_ledger_failure();`,
    );
    const failed = next("absent", 3);
    await assert.rejects(save(failed), /Injected ledger failure/);
    const mark = (
      await db.query<{ status: string; version: number }>(
        "select status,version from hub_attendance where session_id=$1 and person_id=$2",
        [session, person],
      )
    ).rows[0]!;
    assert.deepEqual(mark, { status: "present", version: 3 });
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from hub_attendance_requests where request_key=$1",
          [failed.key],
        )
      ).rows[0]!.n,
      0,
    );
  } finally {
    await db.close();
  }
});
