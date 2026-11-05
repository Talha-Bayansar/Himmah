import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { attendanceApi } from "../src/server/attendance-api.ts";
import { pageInput } from "../src/community/contracts.ts";

test("suggestions use six earlier accessible non-cancelled sessions, current audience and bound pagination", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect();
    const run = async (s: any) => {
      const q = dialect.sqlToQuery(s);
      return (await db.query<any>(q.sql, q.params)).rows;
    };
    const key = () => crypto.randomUUID(),
      org = key();
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Check in','check-in','UTC','owner',gen_random_uuid())`,
      [org],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role) values($1,'owner','owner'),($1,'helper','volunteer'),($1,'outsider','volunteer')`,
      [org],
    );
    const people = createPeopleStore("", run),
      activities = createActivityStore("", run),
      attendance = createAttendanceStore("", run),
      access = createAccessStore("", run);
    const contacts: string[] = [];
    for (const displayName of [
      "Regular",
      "Recent",
      "Old only",
      "Cancelled only",
      "Future only",
      "Never attended",
      "Archived",
      "Outside audience",
    ])
      contacts.push(
        String(
          (
            await people.command("owner", org, "create", key(), {
              displayName,
              givenName: null,
              familyName: null,
            })
          ).id,
        ),
      );
    const activity = String(
      (
        await activities.create("owner", org, key(), {
          name: "Gathering",
          description: "",
          location: "",
          timezone: "UTC",
          audienceGroupIds: [],
          priceMinor: 0,
        })
      )[0]!.id,
    );
    const otherActivity = String(
      (
        await activities.create("owner", org, key(), {
          name: "Other",
          description: "",
          location: "",
          timezone: "UTC",
          audienceGroupIds: [],
          priceMinor: 0,
        })
      )[0]!.id,
    );
    async function session(days: number, a = activity, cancelled = false) {
      const id = String(
        (
          await activities.createSession("owner", org, a, key(), 1, {
            startsAt: new Date(Date.now() + 86400000).toISOString(),
            endsAt: new Date(Date.now() + 90000000).toISOString(),
            location: "",
            timezone: "UTC",
          })
        )[0]!.id,
      );
      await db.query(
        `update hub_activity_sessions set starts_at=now()+$2*interval '1 day',ends_at=now()+$2*interval '1 day'+interval '1 hour',cancelled=$3 where id=$1`,
        [id, days, cancelled],
      );
      return id;
    }
    const target = await session(-0.01),
      previous = [];
    for (let i = 1; i <= 7; i++) previous.push(await session(-i));
    const cancelled = await session(-0.1, activity, true),
      future = await session(1),
      other = await session(-0.1, otherActivity);
    async function mark(s: string, p: string) {
      await db.query(
        `insert into hub_attendance(organization_id,activity_id,session_id,person_id,status,version) select $1,activity_id,$2,$3,'present',1 from hub_activity_sessions where id=$2`,
        [org, s, p],
      );
    }
    await mark(previous[0]!, contacts[0]!);
    await mark(previous[1]!, contacts[0]!);
    await mark(previous[0]!, contacts[1]!);
    await mark(previous[6]!, contacts[2]!);
    await mark(cancelled, contacts[3]!);
    await mark(future, contacts[4]!);
    await mark(other, contacts[5]!);
    await mark(previous[0]!, contacts[6]!);
    await db.query(
      `update himmah.contacts set archived_at=now(),archived_by='owner' where id=$1`,
      [contacts[6]],
    );
    const list = (user = "owner", cursor = "", q = "") =>
      attendance.list(
        user,
        org,
        activity,
        target,
        pageInput(
          new URL(
            "https://test/?limit=1" +
              (cursor ? "&cursor=" + encodeURIComponent(cursor) : "") +
              "&q=" +
              q,
          ),
          "quick",
        ),
        "all",
        "suggested",
      );
    const first = await list();
    assert.equal(first.length, 2); // one extra for cursor
    assert.deepEqual(
      new Set(first.map((p) => p.id)),
      new Set(contacts.slice(0, 2)),
    );
    assert.equal(
      first.find((p) => p.id === contacts[0])?.previousAttendances,
      2,
    );
    assert.equal(first[0]!.billing, null);
    const { pageResult } = await import("../src/community/contracts.ts");
    const page = pageResult(
      first as any,
      pageInput(new URL("https://test/?limit=1"), "quick"),
    );
    const second = await list("owner", page.nextCursor!);
    assert.equal(second.length, 1);
    assert.notEqual(first[0]!.id, second[0]!.id);
    assert.equal((await list("owner", "", "Regular"))[0]!.id, contacts[0]);
    assert.equal((await list("owner", "", "%")).length, 0);
    assert.equal((await list("outsider")).length, 0);
    await access.save("owner", org, null, key(), {
      userId: "helper",
      activityId: activity,
      groupId: null,
      canAttend: true,
      canCollect: false,
    });
    assert.equal((await list("helper")).length, 2);
    const added = (
      await attendance.manage("owner", org, activity, target, {
        key: key(),
        action: "add",
        items: [{ personId: contacts[0]!, version: 0 }],
      })
    )[0]!.result as any;
    assert.equal(added.items[0].version, 1);
    const suggestions = await list();
    assert.equal(
      suggestions.find((p) => p.id === contacts[0])!.status,
      "present",
    );
    const organizations = { get: async () => ({ role: "owner" }) } as any;
    const api = (suffix: string, user = "owner", emailVerified = true) =>
      attendanceApi(
        new Request(
          `https://test/api/organizations/${org}/activities/${activity}/sessions/${target}/attendance?roster=suggested${suffix}`,
        ),
        { id: user, emailVerified },
        organizations,
        activities,
        attendance,
      );
    const response = await api("");
    assert.equal(response!.status, 200);
    assert.equal(response!.headers.get("cache-control"), "no-store");
    const cursor = (await response!.json()).nextCursor; // default page is bounded
    assert.equal(cursor, null);
    assert.equal((await api("", "outsider"))!.status, 403);
    assert.equal((await api("", "owner", false))!.status, 403);
    assert.equal((await api("&limit=51"))!.status, 400);
    const pickerCursor = pageResult(
      first as any,
      pageInput(new URL("https://test/?limit=1"), "other-source"),
    ).nextCursor;
    assert.equal(
      (await api("&cursor=" + encodeURIComponent(pickerCursor!)))!.status,
      400,
    );
    // Changed target audience excludes former attendees outside the current group.
    const group = key();
    await db.query(
      `insert into himmah.groups(id,organization_id,name,created_by,updated_by) values($1,$2,'Current audience','owner','owner')`,
      [group, org],
    );
    await db.query(
      `insert into himmah.group_memberships(organization_id,group_id,contact_id,created_by,updated_by) values($1,$2,$3,'owner','owner')`,
      [org, group, contacts[0]],
    );
    await db.query(
      `update hub_activity_sessions set audience_group_ids=array[$2]::uuid[] where id=$1`,
      [target, group],
    );
    assert.deepEqual(
      (await list()).map((p) => p.id),
      [contacts[0]],
    );
    // Group-only staff cannot learn attendance from a prior session outside their scope.
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role) values($1,'group-helper','volunteer')`,
      [org],
    );
    await access.save("owner", org, null, key(), {
      userId: "group-helper",
      activityId: null,
      groupId: group,
      canAttend: true,
      canCollect: false,
    });
    const otherGroup = key();
    await db.query(
      `insert into himmah.groups(id,organization_id,name,created_by,updated_by) values($1,$2,'Other audience','owner','owner')`,
      [otherGroup, org],
    );
    await db.query(
      `update hub_activity_sessions set audience_group_ids=array[$2]::uuid[] where id=$1`,
      [previous[0], otherGroup],
    );
    const scoped = await list("group-helper");
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0]!.id, contacts[0]);
    assert.equal(scoped[0]!.previousAttendances, 1);
    assert.equal(
      (
        await attendance.list(
          "owner",
          key(),
          activity,
          target,
          pageInput(new URL("https://test"), "quick"),
          "all",
          "suggested",
        )
      ).length,
      0,
    );
    // Scope loss and archive are re-evaluated, rather than reusing an old suggestion list.
    await db.query(
      `update hub_volunteer_assignments set revoked_at=now() where organization_id=$1 and user_id='helper'`,
      [org],
    );
    assert.equal((await list("helper")).length, 0);
    await db.query(
      `delete from hub_memberships where organization_id=$1 and user_id='owner'`,
      [org],
    );
    assert.equal((await list()).length, 0);
  } finally {
    await db.close();
  }
});
