import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createInsightsStore } from "../src/server/insights-store.ts";
import { createLearningStore } from "../src/server/learning-store.ts";
import { pageInput, pageResult } from "../src/community/contracts.ts";

test("directories use one case-insensitive name order across every cursor page, including equal names", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      run = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<any>(q.sql, q.params)).rows;
      };
    const key = () => crypto.randomUUID(),
      org = key(),
      activity = key(),
      session = key(),
      group = key();
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Sorting','sorting','UTC','owner',gen_random_uuid())`,
      [org],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')`,
      [org],
    );
    const names = [
      "zulu",
      "Aaron",
      "bravo",
      "alice",
      "ALICE",
      ...Array.from(
        { length: 52 },
        (_, i) => "Member " + String(51 - i).padStart(2, "0"),
      ),
    ];
    for (const name of names)
      await db.query(
        `insert into himmah.contacts(organization_id,display_name,created_by,updated_by)values($1,$2,'owner','owner')`,
        [org, name],
      );
    await db.query(
      `insert into himmah.groups(id,organization_id,name,created_by,updated_by)values($1,$2,'Members','owner','owner')`,
      [group, org],
    );
    await db.query(
      `insert into himmah.group_memberships(organization_id,group_id,contact_id,created_by,updated_by)select $1,$2,id,'owner','owner' from himmah.contacts where organization_id=$1`,
      [org, group],
    );
    await db.query(
      `insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key)values($1,$2,'Attendance','','','UTC','owner',gen_random_uuid())`,
      [activity, org],
    );
    await db.query(
      `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Attendance','','','UTC',now()-interval '1 hour',now()+interval '1 hour','owner',gen_random_uuid())`,
      [session, org, activity],
    );
    await db.query(
      `insert into hub_attendance(organization_id,activity_id,session_id,person_id,status)select $1,$2,$3,id,'present' from himmah.contacts where organization_id=$1`,
      [org, activity, session],
    );
    const people = createPeopleStore("", run),
      attendance = createAttendanceStore("", run),
      learning = createLearningStore("", run);
    async function walk(
      read: (p: ReturnType<typeof pageInput>) => Promise<any[]>,
    ) {
      const result: any[] = [];
      let cursor: string | null = null;
      do {
        const p = pageInput(
          new URL(
            "https://test/?limit=2" +
              (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
          ),
          "name-test",
        );
        const page = pageResult(await read(p), p);
        result.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(result.length, names.length);
      assert.equal(new Set(result.map((r) => r.id)).size, result.length);
      const found = result.map((r) => r.name ?? r.displayName);
      assert.deepEqual(
        found.slice(0, 4).map((x) => x.toLowerCase()),
        ["aaron", "alice", "alice", "bravo"],
      );
      assert.equal(found.at(-1), "zulu");
    }
    await walk((p) => people.list("owner", org, p));
    await walk((p) => people.groupMembers("owner", org, group, p, false));
    await walk((p) => people.memberOptions("owner", org, group, p));
    await walk((p) =>
      attendance.list(
        "owner",
        org,
        activity,
        session,
        p,
        "all",
        "participants",
      ),
    );
    await walk((p) =>
      attendance.list("owner", org, activity, session, p, "all", "picker"),
    );
    await walk((p) => learning.options("owner", org, p, "contacts"));
    const p = pageInput(new URL("https://test"), "names");
    assert.equal((await people.list("outsider", org, p)).length, 0);
    assert.equal(
      (
        await attendance.list(
          "outsider",
          org,
          activity,
          session,
          p,
          "all",
          "picker",
        )
      ).length,
      0,
    );
    const legacy = pageResult(
      [
        { id: group, createdAt: new Date().toISOString() },
        { id: activity, createdAt: new Date().toISOString() },
      ],
      { ...p, limit: 1 },
    ).nextCursor;
    await assert.rejects(
      () =>
        people.list(
          "owner",
          org,
          pageInput(
            new URL("https://test/?cursor=" + encodeURIComponent(legacy!)),
            "names",
          ),
        ),
      /invalid_cursor/,
    );
    const activities = createActivityStore("", run),
      insights = createInsightsStore("", run);
    for (const name of ["Zulu", "Aardvark", "Beta"])
      await db.query(
        `insert into hub_activities(organization_id,name,description,location,timezone,created_by,creation_key)values($1,$2,'','','UTC','owner',gen_random_uuid())`,
        [org, name],
      );
    assert.deepEqual(
      (await activities.list("owner", org, p)).map((r) => r.name),
      ["Aardvark", "Attendance", "Beta", "Zulu"],
    );
    assert.deepEqual(
      (await insights.options("owner", org, "activities", p)).map(
        (r) => r.name,
      ),
      ["Aardvark", "Attendance", "Beta", "Zulu"],
    );
  } finally {
    await db.close();
  }
});
