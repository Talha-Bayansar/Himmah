import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { activityApi } from "../src/server/activity-api.ts";
import {
  weeklyOccurrences,
  validateOccurrences,
  rescheduleOccurrences,
} from "../src/activities/recurrence.ts";
import { localTime } from "../src/activities/contracts.ts";

test("weekly planning uses local weekdays, inclusive ends, bounds and rejects DST gaps/duplicates", () => {
  const dates = weeklyOccurrences(
    "2099-03-23T18:00",
    "2099-03-23T19:00",
    [1, 3],
    { count: 5 },
  );
  assert.equal(dates.length, 5);
  assert.ok(
    dates.every((d) =>
      [1, 3].includes(new Date(d.startLocal + "Z").getUTCDay()),
    ),
  );
  const weekly = weeklyOccurrences(
    "2099-03-22T18:00",
    "2099-03-22T19:00",
    [0],
    { count: 3 },
  );
  const converted = validateOccurrences(weekly, "Europe/Brussels");
  assert.equal(converted[0]!.startsAt, "2099-03-22T17:00:00.000Z");
  assert.equal(converted[1]!.startsAt, "2099-03-29T16:00:00.000Z");
  assert.equal(
    weeklyOccurrences("2099-01-05T18:00", "2099-01-05T19:00", [1], {
      until: "2099-01-12",
    }).length,
    2,
  );
  for (const stop of [
    { count: 1 },
    { count: 53 },
    { until: "2099-01-01" },
    { until: "2101-01-01" },
    {},
  ])
    assert.throws(() =>
      weeklyOccurrences("2099-01-05T18:00", "2099-01-05T19:00", [1], stop),
    );
  assert.throws(() =>
    weeklyOccurrences("2099-01-05T18:00", "2099-01-05T19:00", [], { count: 2 }),
  );
  for (const start of ["2099-03-29T02:30", "2099-10-25T02:30"])
    assert.throws(() =>
      validateOccurrences(
        [{ startLocal: start, endLocal: start.slice(0, 11) + "03:30" }],
        "Europe/Brussels",
      ),
    );
  const row = {
    id: crypto.randomUUID(),
    version: 2,
    name: "Sohbet",
    timezone: "Europe/Brussels",
    startsAt: converted[0]!.startsAt,
    endsAt: converted[0]!.endsAt,
  };
  const shifted = rescheduleOccurrences(
    [
      row,
      {
        ...row,
        id: crypto.randomUUID(),
        startsAt: converted[1]!.startsAt,
        endsAt: converted[1]!.endsAt,
      },
    ],
    row,
    "2099-03-23T19:00",
    "2099-03-23T20:30",
  );
  assert.equal(shifted[1]!.startLocal, "2099-03-30T19:00");
  assert.equal(shifted[1]!.endLocal, "2099-03-30T20:30");
});

test("series API and SQL enforce complete atomic snapshots, exact retries, scopes, history and deletion", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect();
    const run = async (s: any) => {
      const q = dialect.sqlToQuery(s);
      return (await db.query<any>(q.sql, q.params)).rows;
    };
    const key = () => crypto.randomUUID(),
      org = key(),
      otherOrg = key();
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Community','recurrence','Europe/Brussels','owner',gen_random_uuid()),($2,'Other','other-series','UTC','other',gen_random_uuid())",
      [org, otherOrg],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner'),($1,'helper','volunteer'),($2,'other','owner')",
      [org, otherOrg],
    );
    const store = createActivityStore("", run),
      activity = String(
        (
          await store.create("owner", org, key(), {
            name: "Sohbet",
            description: "Snapshot",
            location: "Hall",
            timezone: "Europe/Brussels",
            audienceGroupIds: [],
            priceMinor: 100,
          })
        )[0]!.id,
      );
    await createAccessStore("", run).save("owner", org, null, key(), {
      userId: "helper",
      activityId: activity,
      groupId: null,
      canAttend: true,
      canCollect: false,
    });
    const organizations = {
      get: async (user: string, id: string) => {
        const r = (
          await db.query<any>(
            "select role from hub_memberships where user_id=$1 and organization_id=$2",
            [user, id],
          )
        ).rows[0];
        return r ? { id, role: r.role } : null;
      },
    };
    const api = async (body: any, user = "owner", query = "plan=true") => {
      const r = await activityApi(
        new Request(
          `https://himmah.test/api/organizations/${org}/activities/${activity}/sessions?${query}`,
          {
            method: body ? "POST" : "GET",
            ...(body ? { body: JSON.stringify(body) } : {}),
          },
        ),
        { id: user, emailVerified: true },
        organizations as any,
        store,
      );
      return { status: r!.status, body: await r!.json() };
    };
    const rule = {
      startLocal: "2099-03-22T18:00",
      endLocal: "2099-03-22T19:00",
      weekdays: [0],
      stop: { count: 4 },
    };
    const create = {
      mode: "create",
      version: 1,
      key: key(),
      location: "Hall",
      priceMinor: 100,
      rule,
      occurrences: [],
    };
    assert.equal(
      (
        await api({
          ...create,
          key: key(),
          rule: { ...rule, stop: { count: 53 } },
        })
      ).status,
      400,
    );
    assert.equal(
      (await api({ ...create, key: key(), priceMinor: undefined })).status,
      400,
    );
    const created = await api(create);
    assert.equal(created.status, 200);
    assert.equal(created.body.count, 4);
    assert.deepEqual(await api(create), created);
    assert.equal((await api({ ...create, location: "Elsewhere" })).status, 409);
    assert.ok([403, 404].includes((await api(create, "helper")).status));
    assert.equal(
      (await store.planSessions("other", org, activity, key(), {}))[0]!
        .result &&
        (
          (await store.planSessions("other", org, activity, key(), {}))[0]!
            .result as any
        ).code,
      "forbidden",
    );
    assert.deepEqual(
      await store.schedule("other", org, activity, created.body.ids[0]),
      [],
    );
    const forged = {
      mode: "create",
      version: 1,
      timezone: "Europe/Brussels",
      location: "Hall",
      priceMinor: 0,
      occurrences: [
        { startsAt: "2099-01-05T18:00:00Z", endsAt: "2099-01-05T19:00:00Z" },
        { startsAt: "2101-01-05T18:00:00Z", endsAt: "2101-01-05T19:00:00Z" },
      ],
    };
    assert.equal(
      (
        (await store.planSessions("owner", org, activity, key(), forged))[0]!
          .result as any
      ).code,
      "series_limit",
    );
    const ids = created.body.ids as string[];
    const rows = async () =>
      (
        await db.query<any>(
          'select id,version,name,topic,timezone,starts_at::text as "startsAt",ends_at::text as "endsAt",series_id,series_position from hub_activity_sessions where organization_id=$1 order by series_position',
          [org],
        )
      ).rows;
    let all = await rows();
    assert.equal(new Set(all.map((r) => r.series_id)).size, 1);
    assert.deepEqual(
      all.map((r) => r.series_position),
      [0, 1, 2, 3],
    );
    assert.equal(all[0]!.name, "Sohbet");
    // Independent topic and settings are untouched by scheduling.
    await db.query("update hub_activity_sessions set topic=$1 where id=$2", [
      "Patience",
      ids[1],
    ]);
    await db.query(
      "insert into hub_session_registration_settings(organization_id,activity_id,session_id,mode,capacity,version)values($1,$2,$3,'required',15,1)",
      [org, activity, ids[1]],
    );
    const person = key(),
      charge = key(),
      receipt = key();
    await db.query(
      "insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,'Synthetic attendee','owner','owner')",
      [person, org],
    );
    await db.query(
      "insert into hub_attendance(organization_id,activity_id,session_id,person_id,status,version)values($1,$2,$3,$4,'present',1)",
      [org, activity, ids[0], person],
    );
    await db.query(
      "insert into hub_registration_charges(id,organization_id,activity_id,session_id,person_id,amount_minor,source,created_by)values($1,$2,$3,$4,$5,100,'walk_in','owner')",
      [charge, org, activity, ids[1], person],
    );
    await db.query(
      "insert into hub_cash_receipts(id,organization_id,activity_id,session_id,amount_minor,occurred_at,created_by)values($1,$2,$3,$4,100,now(),'owner')",
      [receipt, org, activity, ids[1]],
    );
    await db.query(
      "insert into hub_cash_allocations(organization_id,receipt_id,charge_id,amount_minor)values($1,$2,$3,100)",
      [org, receipt, charge],
    );
    const history = async () =>
      Promise.all(
        [
          "hub_attendance",
          "hub_cash_receipts",
          "hub_registration_charges",
          "hub_cash_allocations",
        ].map(
          async (table) =>
            (await db.query<any>(`select to_jsonb(r) as r from ${table} r`))
              .rows,
        ),
      );
    const historicalBefore = await history();
    const detailsBefore = (
      await db.query<any>(
        "select to_jsonb(r) as r from hub_session_registration_settings r",
      )
    ).rows;
    const input = (rows: any[]) =>
      rows.map((r) => ({
        id: r.id,
        version: r.version,
        startLocal: localTime(r.startsAt, r.timezone),
        endLocal: localTime(r.endsAt, r.timezone),
      }));
    const current = await api(null, "owner", "schedule=" + ids[1]);
    assert.equal(current.body.items.length, 3);
    const one = {
      mode: "edit",
      key: key(),
      anchor: ids[1],
      scope: "one",
      occurrences: rescheduleOccurrences(
        [all[1]],
        all[1],
        "2099-03-30T19:00",
        "2099-03-30T20:30",
      ),
    };
    assert.equal((await api(one)).status, 200);
    assert.equal((await rows())[0]!.version, 1);
    assert.equal((await rows())[1]!.topic, "Patience");
    assert.equal((await rows())[2]!.version, 1);
    assert.deepEqual(
      (
        await db.query<any>(
          "select to_jsonb(r) as r from hub_session_registration_settings r",
        )
      ).rows,
      detailsBefore,
    );
    all = await rows();
    const future = {
      mode: "edit",
      key: key(),
      anchor: ids[1],
      scope: "future",
      occurrences: rescheduleOccurrences(
        all.slice(1),
        all[1],
        "2099-03-31T19:00",
        "2099-03-31T20:00",
      ),
    };
    const before = await rows();
    assert.equal(
      (
        await api({
          ...future,
          key: key(),
          occurrences: future.occurrences.slice(0, 2),
        })
      ).status,
      409,
    );
    assert.deepEqual(await rows(), before);
    await db.query(
      "update hub_activity_sessions set version=version+1 where id=$1",
      [ids[2]],
    );
    assert.equal((await api(future)).status, 409);
    assert.equal((await rows())[1]!.startsAt, before[1]!.startsAt);
    all = await rows();
    future.occurrences = rescheduleOccurrences(
      all.slice(1),
      all[1],
      "2099-03-31T19:00",
      "2099-03-31T20:00",
    );
    assert.equal((await api(future)).status, 200);
    const after = await rows();
    assert.deepEqual(after[0], all[0]);
    assert.equal(after[1]!.topic, "Patience");
    assert.deepEqual(await api(future), {
      status: 200,
      body: { ids: ids.slice(1), count: 3 },
    });
    const audit = (
      await db.query<any>(
        "select response->'scheduleHistory' as history from hub_session_operations where organization_id=$1 and request_key=$2",
        [org, future.key],
      )
    ).rows[0]!.history;
    assert.equal(audit.length, 3);
    assert.equal(audit[0].before.version, all[1]!.version);
    const proposedNearStart = localTime(
      new Date(Date.now() + 10 * 60000).toISOString(),
      "Europe/Brussels",
    );
    const proposedNearEnd = localTime(
      new Date(Date.now() + 70 * 60000).toISOString(),
      "Europe/Brussels",
    );
    assert.equal(
      (
        await api({
          mode: "edit",
          key: key(),
          anchor: ids[1],
          scope: "one",
          occurrences: [
            {
              id: ids[1],
              version: after[1]!.version,
              startLocal: proposedNearStart,
              endLocal: proposedNearEnd,
            },
          ],
        })
      ).status,
      409,
    );
    assert.deepEqual(await rows(), after);
    // Replay is stable even after a session has started; current permission still comes first.
    await db.query(
      "update hub_activity_sessions set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=$1",
      [ids[0]],
    );
    assert.deepEqual(await api(create), created);
    await db.query(
      "update hub_memberships set role='volunteer' where organization_id=$1 and user_id='owner'",
      [org],
    );
    assert.ok([403, 404].includes((await api(create)).status));
    assert.equal(
      (
        (await store.planSessions("owner", org, activity, create.key, {}))[0]!
          .result as any
      ).code,
      "forbidden",
    );
    await db.query(
      "update hub_memberships set role='owner' where organization_id=$1 and user_id='owner'",
      [org],
    );
    all = await rows();
    const protectedEdit = {
      mode: "edit",
      key: key(),
      anchor: ids[0],
      scope: "future",
      occurrences: input(all),
    };
    assert.equal((await api(protectedEdit)).status, 409);
    // Cancellation creates a gap and is never revived by future schedule changes.
    await db.query(
      "update hub_activity_sessions set cancelled=true,version=version+1 where id=$1",
      [ids[2]],
    );
    const scope = await api(null, "owner", "schedule=" + ids[1]);
    assert.equal(scope.body.items.length, 2);
    const scopeRows = scope.body.items;
    assert.equal(
      (
        await api({
          mode: "edit",
          key: key(),
          anchor: ids[1],
          scope: "future",
          occurrences: rescheduleOccurrences(
            scopeRows,
            scopeRows[0],
            "2099-04-01T18:00",
            "2099-04-01T19:00",
          ),
        })
      ).status,
      200,
    );
    assert.equal((await rows())[2]!.version, after[2]!.version + 1);
    // Frozen required-registration schedules fail the complete update without touching siblings.
    await db.query(
      "update hub_activity_sessions set starts_at=now()+interval '10 minutes',ends_at=now()+interval '70 minutes' where id=$1",
      [ids[3]],
    );
    await db.query(
      "insert into hub_session_registration_settings(organization_id,activity_id,session_id,mode,version)values($1,$2,$3,'required',1)",
      [org, activity, ids[3]],
    );
    const frozen = await api(null, "owner", "schedule=" + ids[1]);
    const snap = await rows();
    assert.equal(
      (
        await api({
          mode: "edit",
          key: key(),
          anchor: ids[1],
          scope: "future",
          occurrences: rescheduleOccurrences(
            frozen.body.items,
            frozen.body.items[0],
            "2099-04-02T18:00",
            "2099-04-02T19:00",
          ),
        })
      ).status,
      409,
    );
    assert.deepEqual(await rows(), snap);
    assert.deepEqual(await history(), historicalBefore);
    // Existing deletion clears series receipts with the ordinary activity subtree.
    const preview = (await store.deletionPreview("owner", org, activity))[0]!
      .result as any;
    assert.deepEqual(
      (
        await store.deleteActivity(
          "owner",
          org,
          activity,
          key(),
          preview.snapshot,
        )
      )[0]!.result,
      { deleted: true },
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from hub_session_operations",
        )
      ).rows[0]!.n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("additive series migration preserves existing session fields and enforces paired positions", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    await db.exec(
      "alter table hub_activity_sessions drop constraint hub_session_series_pair; alter table hub_activity_sessions drop constraint hub_session_series_position; alter table hub_activity_sessions drop column series_id; alter table hub_activity_sessions drop column series_position",
    );
    const org = crypto.randomUUID(),
      activity = crypto.randomUUID(),
      session = crypto.randomUUID();
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Community','series-upgrade','UTC','owner',gen_random_uuid())",
      [org],
    );
    await db.query(
      "insert into hub_activities(id,organization_id,name,description,location,timezone,audience_group_ids,created_by,creation_key)values($1,$2,'Sohbet','','Hall','UTC','{}','owner',gen_random_uuid())",
      [activity, org],
    );
    await db.query(
      "insert into hub_activity_sessions(id,organization_id,activity_id,name,topic,description,location,timezone,audience_group_ids,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Sohbet','Preserve topic','','Hall','UTC','{}',now()-interval '1 day',now()-interval '23 hours','owner',gen_random_uuid())",
      [session, org, activity],
    );
    const before = (
      await db.query<any>("select to_jsonb(s) r from hub_activity_sessions s")
    ).rows;
    await db.exec(
      await readFile("db/migrations/generated/0007_session_series.sql", "utf8"),
    );
    const after = (
      await db.query<any>(
        "select to_jsonb(s)-'series_id'-'series_position' r from hub_activity_sessions s",
      )
    ).rows;
    assert.deepEqual(after, before);
    await assert.rejects(
      db.query(
        "update hub_activity_sessions set series_id=gen_random_uuid() where id=$1",
        [session],
      ),
    );
    await assert.rejects(
      db.query(
        "update hub_activity_sessions set series_position=1 where id=$1",
        [session],
      ),
    );
    await assert.rejects(
      db.query(
        "update hub_activity_sessions set series_id=gen_random_uuid(),series_position=52 where id=$1",
        [session],
      ),
    );
  } finally {
    await db.close();
  }
});
