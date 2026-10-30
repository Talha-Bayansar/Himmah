import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { createDashboardStore } from "../src/server/dashboard-store.ts";
import { createCashStore } from "../src/server/cash-store.ts";
import { sessionInput, sessionTitle } from "../src/activities/contracts.ts";

const fields = {
  location: "Hall",
  startLocal: "2099-01-10T18:00",
  endLocal: "2099-01-10T19:00",
};
test("Session topics are optional, trimmed, bounded and separate from activity names", () => {
  assert.equal(
    sessionInput({ ...fields, topic: "  Patience in everyday life  " }, "UTC")
      .topic,
    "Patience in everyday life",
  );
  assert.equal(sessionInput(fields, "UTC").topic, undefined);
  assert.equal(sessionInput({ ...fields, topic: "   " }, "UTC").topic, "");
  for (const topic of ["x".repeat(161), "Title\nAnother", 7, null])
    assert.throws(() => sessionInput({ ...fields, topic }, "UTC"));
  assert.equal(sessionTitle({ name: "Sohbet", topic: "Patience" }), "Patience");
  assert.equal(sessionTitle({ name: "Sohbet", topic: "" }), "Sohbet");
  assert.equal(sessionTitle({ name: "Sohbet" }), "Sohbet");
});
test("Session topic creation/retry/edit/clear preserves scheduling, names, scope and reporting previews", async () => {
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
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Community','session-topics','UTC','owner',gen_random_uuid())",
      [org],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner'),($1,'helper','volunteer')",
      [org],
    );
    const activities = createActivityStore("", run),
      dashboard = createDashboardStore("", run),
      cash = createCashStore("", run);
    const activity = String(
      (
        await activities.create("owner", org, key(), {
          name: "Sohbet",
          description: "",
          location: "Hall",
          timezone: "UTC",
          audienceGroupIds: [],
          priceMinor: 100,
        })
      )[0]!.id,
    );
    const input = sessionInput(
        { ...fields, topic: "Patience in everyday life" },
        "UTC",
      ),
      creation = key();
    const session = (
      await activities.createSession("owner", org, activity, creation, 1, input)
    )[0]!;
    assert.equal(session.topic, "Patience in everyday life");
    assert.equal(session.name, "Sohbet");
    assert.equal(
      (
        await activities.createSession(
          "owner",
          org,
          activity,
          creation,
          1,
          input,
        )
      )[0]!.id,
      session.id,
    );
    assert.equal(
      (
        await activities.createSession("owner", org, activity, creation, 1, {
          ...input,
          topic: "Different subject",
        })
      ).length,
      0,
    );
    const id = String(session.id);
    assert.equal(
      (
        await activities.updateSession("helper", org, activity, id, 1, {
          ...input,
          topic: "Unauthorized",
        })
      ).length,
      0,
    );
    const edited = (
      await activities.updateSession("owner", org, activity, id, 1, {
        ...input,
        topic: "Gratitude",
      })
    )[0]!;
    assert.equal(edited.topic, "Gratitude");
    assert.equal(edited.version, 2);
    assert.equal(edited.name, "Sohbet");
    assert.equal(
      (await activities.updateSession("owner", org, activity, id, 1, input))
        .length,
      0,
    );
    // Older clients omitting topic must not erase it while changing an unrelated field.
    const omitted = sessionInput({ ...fields, location: "New hall" }, "UTC");
    assert.equal(
      (
        await activities.updateSession("owner", org, activity, id, 2, omitted)
      )[0]!.topic,
      "Gratitude",
    );
    await createAccessStore("", run).save("owner", org, null, key(), {
      userId: "helper",
      activityId: activity,
      groupId: null,
      canAttend: true,
      canCollect: true,
    });
    assert.equal(
      (await activities.session("helper", org, activity, id))[0]!.topic,
      "Gratitude",
    );
    assert.equal(
      (await activities.session("stranger", org, activity, id)).length,
      0,
    );
    assert.equal(
      ((await dashboard.get("helper", org))[0]!.items as any[])[0].topic,
      "Gratitude",
    );
    assert.equal(
      (await cash.summary("helper", org, activity, id))[0]!.topic,
      "Gratitude",
    );
    assert.equal(
      ((await activities.get("owner", org, activity))[0]!.nextSession as any)
        .topic,
      "Gratitude",
    );
    assert.equal(
      (
        await activities.updateSession("owner", org, activity, id, 3, {
          ...input,
          topic: "",
        })
      )[0]!.topic,
      "",
    );
    const without = (
      await activities.createSession(
        "owner",
        org,
        activity,
        key(),
        1,
        sessionInput(
          {
            ...fields,
            startLocal: "2099-01-11T18:00",
            endLocal: "2099-01-11T19:00",
          },
          "UTC",
        ),
      )
    )[0]!;
    assert.equal(without.topic, "");
    assert.equal(without.name, "Sohbet");
    await db.query(
      "update hub_activity_sessions set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=$1",
      [id],
    );
    assert.equal(
      (await activities.updateSession("owner", org, activity, id, 4, input))
        .length,
      0,
    );
    assert.equal(
      (await db.query("select * from hub_attendance")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from hub_cash_receipts")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("additive migration leaves existing session data unchanged and defaults the new optional topic", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    await db.exec(
      "alter table hub_activity_sessions drop constraint hub_session_topic; alter table hub_activity_sessions drop column topic",
    );
    const org = crypto.randomUUID(),
      activity = crypto.randomUUID(),
      session = crypto.randomUUID();
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Community','topic-upgrade','UTC','owner',gen_random_uuid())",
      [org],
    );
    await db.query(
      "insert into hub_activities(id,organization_id,name,description,location,timezone,audience_group_ids,created_by,creation_key)values($1,$2,'Sohbet','','Hall','UTC','{}','owner',gen_random_uuid())",
      [activity, org],
    );
    await db.query(
      "insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,audience_group_ids,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Sohbet','','Hall','UTC','{}',now(),now()+interval '1 hour','owner',gen_random_uuid())",
      [session, org, activity],
    );
    const before = (
      await db.query<any>(
        "select to_jsonb(s) as row from hub_activity_sessions s",
      )
    ).rows[0].row;
    await db.exec(
      await readFile("db/migrations/generated/0006_session_topic.sql", "utf8"),
    );
    const after = (
      await db.query<any>(
        "select to_jsonb(s) as row from hub_activity_sessions s",
      )
    ).rows[0].row;
    assert.equal(after.topic, "");
    delete after.topic;
    assert.deepEqual(after, before);
    await assert.rejects(
      db.query("update hub_activity_sessions set topic=$1 where id=$2", [
        "x".repeat(161),
        session,
      ]),
    );
  } finally {
    await db.close();
  }
});
