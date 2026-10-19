import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createAccessStore } from "../src/server/access-store.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createPointsStore } from "../src/server/points-store.ts";
import { pageInput } from "../src/community/contracts.ts";
import { accessInput } from "../src/access/contracts.ts";
import { pointsApi } from "../src/server/points-api.ts";
import { attendanceApi } from "../src/server/attendance-api.ts";
import { accessApi } from "../src/server/access-api.ts";
import type { OrganizationStore } from "../src/server/store.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
test("assignment inputs require a single scope and at least one explicit capability", () => {
  for (const body of [
    {
      userId: "vol",
      canAttend: false,
      canAward: false,
      groupId: crypto.randomUUID(),
    },
    { userId: "vol", canAttend: true, canAward: false },
    {
      userId: "vol",
      canAttend: true,
      canAward: false,
      groupId: crypto.randomUUID(),
      activityId: crypto.randomUUID(),
    },
  ])
    assert.throws(() => accessInput(body, true));
  assert.deepEqual(accessInput({ canAttend: true, canAward: false }, false), {
    canAttend: true,
    canAward: false,
  });
});
test("PostgreSQL volunteer scope: independent capabilities, filtered rosters/history, hostile bulk payloads and immediate audited revocation", async () => {
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
      `insert into hub_memberships(organization_id,user_id,role,display_name) values($1,'owner-a','owner','Owner'),($1,'vol-a','volunteer','Volunteer A'),($1,'vol-b','volunteer','Volunteer B'),($2,'owner-b','owner','Other owner')`,
      [org, other],
    );
    const ga = crypto.randomUUID(),
      gb = crypto.randomUUID(),
      foreignGroup = crypto.randomUUID(),
      pa = crypto.randomUUID(),
      pb = crypto.randomUUID(),
      aa = crypto.randomUUID(),
      ab = crypto.randomUUID(),
      sa = crypto.randomUUID(),
      sb = crypto.randomUUID();
    for (const [id, tenant, name] of [
      [ga, org, "Assigned group"],
      [gb, org, "Private group"],
      [foreignGroup, other, "Other org group"],
    ])
      await db.query(
        `insert into hub_groups(id,organization_id,name,created_by,creation_key) values($1,$2,$3,'owner-a',$4)`,
        [id, tenant, name, crypto.randomUUID()],
      );
    for (const [id, name] of [
      [pa, "Assigned member"],
      [pb, "Private member"],
    ])
      await db.query(
        `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,$3,'owner-a',$4,'owner-a')`,
        [id, org, name, crypto.randomUUID()],
      );
    await db.query(
      `insert into hub_group_people(organization_id,group_id,person_id) values($1,$2,$3),($1,$4,$5)`,
      [org, ga, pa, gb, pb],
    );
    for (const [id, name, group] of [
      [aa, "Assigned activity", ga],
      [ab, "Private activity", gb],
    ])
      await db.query(
        `insert into hub_activities(id,organization_id,name,description,location,timezone,audience_group_ids,created_by,creation_key) values($1,$2,$3,'','','UTC',ARRAY[$4]::uuid[],'owner-a',$5)`,
        [id, org, name, group, crypto.randomUUID()],
      );
    for (const [id, activity, groups] of [
      [sa, aa, [ga, gb]],
      [sb, ab, [gb]],
    ])
      await db.query(
        `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,audience_group_ids,starts_at,ends_at,attendance_points,earning_rule_version,created_by,creation_key) values($1,$2,$3,'Session','','','UTC',$4::uuid[],'2020-01-01T10:00Z','2020-01-01T11:00Z',10,1,'owner-a',$5)`,
        [id, org, activity, groups, crypto.randomUUID()],
      );
    const dialect = new PgDialect(),
      execute = async (st: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
      };
    const access = createAccessStore(
        "postgresql://test:test@localhost/test",
        execute,
      ),
      activities = createActivityStore(
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
    const page = pageInput(
      new URL("https://test.invalid?limit=1"),
      org + "/test",
    );
    const grant = async (body: Record<string, unknown>, user = "owner-a") =>
      (await access.save(user, org, null, crypto.randomUUID(), body))[0]!
        .result as { id?: string; code?: string };
    const payload = {
      userId: "vol-a",
      groupId: ga,
      activityId: null,
      canAttend: true,
      canAward: false,
    };
    assert.equal((await grant(payload, "vol-a")).code, "forbidden");
    assert.equal(
      (await grant({ ...payload, groupId: foreignGroup })).code,
      "not_found",
    );
    const assignment = await grant(payload);
    assert.ok(assignment.id);
    assert.equal((await grant(payload)).code, "access_duplicate");
    assert.equal((await activities.list("vol-a", org, page)).length, 1);
    assert.equal((await activities.get("vol-a", org, ab)).length, 0);
    assert.equal((await activities.session("vol-a", org, ab, sb)).length, 0);
    const scopedSession = (await activities.session("vol-a", org, aa, sa))[0]!;
    assert.deepEqual(scopedSession.audienceGroupIds, [ga]);
    assert.deepEqual(
      (scopedSession.groups as { name: string }[]).map((g) => g.name),
      ["Assigned group"],
    );
    assert.deepEqual(
      (await attendance.list("vol-a", org, aa, sa, page, "all")).map(
        (row) => row.id,
      ),
      [pa],
    );
    assert.equal((await attendance.summary("vol-a", org, aa, sa))[0]!.total, 1);
    assert.equal((await access.members("vol-a", org, page)).length, 0);
    const check = {
      key: crypto.randomUUID(),
      confirmPoints: true as const,
      status: "present" as const,
      reason: "",
      items: [{ personId: pa, version: 0 }],
    };
    const marked = (await attendance.save("vol-a", org, aa, sa, check))[0]!
      .result as { code?: string; items: { pointsDelta: number }[] };
    assert.equal(marked.items[0]!.pointsDelta, 10);
    const mixed = (
      await attendance.save("vol-a", org, aa, sa, {
        ...check,
        key: crypto.randomUUID(),
        items: [
          { personId: pa, version: 1 },
          { personId: pb, version: 0 },
        ],
      })
    )[0]!.result as { code: string };
    assert.equal(mixed.code, "forbidden");
    assert.equal(
      (
        (
          await attendance.preview("vol-a", org, aa, sa, {
            ...check,
            items: [{ personId: pb, version: 0 }],
          })
        )[0]!.result as { code: string }
      ).code,
      "forbidden",
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from hub_attendance where organization_id=$1 and person_id=$2",
          [org, pb],
        )
      ).rows[0]!.count,
      0,
    );
    assert.equal(
      (await attendance.history("vol-a", org, aa, sa, pb, page)).length,
      0,
    );
    const award = {
      key: crypto.randomUUID(),
      kind: "award" as const,
      people: [pa],
      amount: 7,
      reason: "Volunteer award",
      occurredAt: "2020-01-01T12:00Z",
      activityId: null,
      sessionId: null,
      originalId: null,
      version: null,
    };
    assert.equal(
      ((await points.save("vol-a", org, award))[0]!.result as { code: string })
        .code,
      "forbidden",
    );
    await access.save("owner-a", org, assignment.id!, null, {
      action: "edit",
      version: 1,
      canAttend: false,
      canAward: true,
    });
    assert.equal((await attendance.canSession("vol-a", org, aa, sa)).length, 0);
    assert.equal(
      (
        (await attendance.save("vol-a", org, aa, sa, check))[0]!.result as {
          code: string;
        }
      ).code,
      "forbidden",
    );
    assert.deepEqual(
      (await access.members("vol-a", org, page)).map((p) => p.id),
      [pa],
    );
    const awarded = (await points.save("vol-a", org, award))[0]!.result;
    assert.deepEqual(
      (await points.save("vol-a", org, award))[0]!.result,
      awarded,
    );
    assert.equal(
      (
        (
          await points.save("vol-a", org, {
            ...award,
            key: crypto.randomUUID(),
            people: [pa, pb],
          })
        )[0]!.result as { code: string }
      ).code,
      "forbidden",
    );
    await points.save("owner-a", org, {
      ...award,
      key: crypto.randomUUID(),
      amount: 99,
      reason: "Unrelated private award",
    });
    assert.equal((await points.member("vol-a", org, pa))[0]!.balance, "7");
    assert.equal((await points.member("vol-a", org, pb)).length, 0);
    assert.ok(
      (await points.history("vol-a", org, pa, page)).every(
        (x) => x.reason === "Volunteer award",
      ),
    );
    const own = (await points.history("vol-a", org, pa, page))[0]!;
    assert.equal(
      (
        (
          await points.save("vol-a", org, {
            ...award,
            key: crypto.randomUUID(),
            kind: "correct",
            originalId: String(own.id),
            version: 1,
          })
        )[0]!.result as { code: string }
      ).code,
      "forbidden",
    );
    const actGrant = await grant({
      userId: "vol-b",
      groupId: null,
      activityId: aa,
      canAttend: true,
      canAward: false,
    });
    assert.ok(actGrant.id);
    assert.equal(
      (
        await attendance.list(
          "vol-b",
          org,
          aa,
          sa,
          pageInput(new URL("https://test.invalid?limit=50"), org + "/all"),
          "all",
        )
      ).length,
      2,
    );
    assert.equal(
      ((await activities.session("vol-b", org, aa, sa))[0]!.groups as unknown[])
        .length,
      2,
    );
    const revoke = { action: "revoke", version: 2 };
    assert.equal(
      (
        (await access.save("owner-a", org, assignment.id!, null, revoke))[0]!
          .result as { id: string }
      ).id,
      assignment.id,
    );
    await access.save("owner-a", org, assignment.id!, null, revoke);
    assert.equal((await access.members("vol-a", org, page)).length, 0);
    assert.equal((await points.member("vol-a", org, pa)).length, 0);
    assert.equal(
      ((await points.save("vol-a", org, award))[0]!.result as { code: string })
        .code,
      "forbidden",
    );
    assert.equal(
      (
        await access.history(
          "owner-a",
          org,
          assignment.id!,
          pageInput(new URL("https://test.invalid?limit=50"), org + "/history"),
        )
      ).length,
      3,
    );
    await db.query(
      `update hub_memberships set role='admin' where organization_id=$1 and user_id='vol-b'`,
      [org],
    );
    await db.query(
      `update hub_memberships set role='volunteer' where organization_id=$1 and user_id='vol-b'`,
      [org],
    );
    assert.equal((await access.me("vol-b", org))[0]!.canAttend, false);
    assert.equal(
      (await access.get("owner-a", org, actGrant.id!))[0]!.revokeReason,
      "staff_change",
    );
    const organizations = {
      get: async (user: string, id: string) =>
        id === org && ["owner-a", "vol-a"].includes(user)
          ? {
              id: org,
              role: user === "owner-a" ? "owner" : "volunteer",
              timezone: "UTC",
            }
          : null,
    } as unknown as OrganizationStore;
    const req = (suffix: string) =>
      new Request("https://test.invalid/api/organizations/" + org + suffix);
    assert.equal(
      (await accessApi(
        req("/access"),
        { id: "vol-a", emailVerified: true },
        organizations,
        access,
      ))!.status,
      403,
    );
    assert.equal(
      (await pointsApi(
        req("/members/" + pa),
        { id: "vol-a", emailVerified: true },
        organizations,
        points,
      ))!.status,
      403,
    );
    assert.equal(
      (await attendanceApi(
        req("/activities/" + aa + "/sessions/" + sa + "/attendance"),
        { id: "vol-a", emailVerified: true },
        organizations,
        activities,
        attendance,
      ))!.status,
      403,
    );
    assert.equal(
      (await accessApi(
        req("/access/me"),
        { id: "vol-a", emailVerified: true },
        organizations,
        access,
      ))!.status,
      200,
    );
    assert.equal(
      (await accessApi(
        req("/work/members"),
        { id: "vol-a", emailVerified: false },
        organizations,
        access,
      ))!.status,
      403,
    );
  } finally {
    await db.close();
  }
});
