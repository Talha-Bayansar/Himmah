import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { createActivityStore } from "../src/server/activity-store.ts";
import { activityApi } from "../src/server/activity-api.ts";
import { createStore } from "../src/server/store.ts";
import { installDatabase } from "./database.ts";
test("permanent deletion enforces review, access, atomicity, exact retries and scoped history guards", async () => {
  const db = new PGlite();
  await installDatabase(db);
  const org = "58699424-738a-43a2-949e-884624695c82",
    ids = [
      "7cd676a0-6eb0-4ca2-9ce9-3e5f40d1c72a",
      "8e5702f2-33d0-4c97-acac-ff7ab5a4a6b1",
      "d08816db-fbf2-4264-aea1-19222acc736c",
    ];
  const key = () => crypto.randomUUID(),
    person = key(),
    keep = key(),
    session = key(),
    charge = key(),
    receipt = key(),
    request = key();
  await db.query(
    "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Cleanup fixture','cleanup-fixture','UTC','owner',gen_random_uuid())",
    [org],
  );
  await db.query(
    "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')",
    [org],
  );
  await db.query(
    "insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,'Synthetic person','owner','owner')",
    [person, org],
  );
  for (const [i, id] of [...ids, keep].entries())
    await db.query(
      "insert into hub_activities(id,organization_id,name,description,location,timezone,audience_group_ids,created_by,creation_key)values($1,$2,$3,'','','UTC','{}','owner',gen_random_uuid())",
      [id, org, i === 3 ? "Keep me" : "Test " + i],
    );
  for (const [id, activity] of [
    [session, ids[0]],
    [key(), keep],
  ])
    await db.query(
      "insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,audience_group_ids,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Session','','','UTC','{}',now(),now()+interval '1 hour','owner',gen_random_uuid())",
      [id, org, activity],
    );
  await db.query(
    "insert into hub_attendance(organization_id,activity_id,session_id,person_id,status,version)values($1,$2,$3,$4,'present',1)",
    [org, ids[0], session, person],
  );
  await db.query(
    "insert into hub_attendance_requests(id,organization_id,activity_id,session_id,request_key,actor_id,payload,response)values($1,$2,$3,$4,gen_random_uuid(),'owner','{}','{}')",
    [request, org, ids[0], session],
  );
  await db.query(
    "insert into hub_attendance_changes(organization_id,session_id,person_id,request_id,actor_id,before_status,after_status,reason,version)values($1,$2,$3,$4,'owner','unmarked','present','',1)",
    [org, session, person, request],
  );
  await db.query(
    "insert into hub_registration_charges(id,organization_id,activity_id,session_id,person_id,amount_minor,source,created_by)values($1,$2,$3,$4,$5,100,'walk_in','owner')",
    [charge, org, ids[0], session, person],
  );
  await db.query(
    "insert into hub_cash_receipts(id,organization_id,activity_id,session_id,amount_minor,occurred_at,created_by)values($1,$2,$3,$4,100,now(),'owner')",
    [receipt, org, ids[0], session],
  );
  await db.query(
    "insert into hub_cash_allocations(organization_id,receipt_id,charge_id,amount_minor)values($1,$2,$3,50)",
    [org, receipt, charge],
  );
  await db.query(
    "insert into hub_cash_allocation_corrections(organization_id,receipt_id,charge_id,request_key,reason,created_by)values($1,$2,$3,gen_random_uuid(),'unpaid','owner')",
    [org, receipt, charge],
  );
  await db.query(
    "insert into hub_directory_audit(organization_id,actor_id,action,entity_id)values($1,'owner','activity.create',$2),($1,'owner','activity.create',$3)",
    [org, ids[0], keep],
  );

  const dialect = new PgDialect(),
    run = async (q: any) => {
      const s = dialect.sqlToQuery(q);
      return (await db.query<any>(s.sql, s.params)).rows;
    };
  const store = createActivityStore("", run),
    organizations = createStore("", run);
  const preview = async (actor = "owner", activity = ids[0]!) =>
    (await store.deletionPreview(actor, org, activity))[0]!.result as any;
  const command = async (
    snapshot: string,
    requestKey = key(),
    actor = "owner",
    activity = ids[0]!,
  ) =>
    (await store.deleteActivity(actor, org, activity, requestKey, snapshot))[0]!
      .result as any;
  const before = await preview();
  assert.equal(before.sessions, 1);
  assert.equal(before.attendance, 1);
  assert.equal(before.receipts, 1);
  assert.equal(before.charges, 1);
  assert.equal((await preview("stranger")).code, "forbidden");
  assert.equal(
    (await command(before.snapshot, key(), "stranger")).code,
    "forbidden",
  );
  const api = (method: string, body?: any, actor = "owner") =>
    activityApi(
      new Request(
        `https://himmah.test/api/organizations/${org}/activities/${ids[0]}${method === "GET" ? "?deletionPreview=true" : ""}`,
        { method, ...(body ? { body: JSON.stringify(body) } : {}) },
      ),
      { id: actor, emailVerified: true },
      organizations,
      store,
    );
  assert.equal((await api("GET"))!.status, 200);
  assert.equal(
    (await api("DELETE", { key: key(), snapshot: "forged" }))!.status,
    400,
  );
  await db.query(
    "update hub_activities set name='Changed before confirmation',version=version+1 where id=$1",
    [ids[0]],
  );
  assert.equal((await command(before.snapshot)).code, "conflict");
  const reviewed = await preview(),
    requestKey = key();
  await db.exec(
    "create table deletion_unexpected_dependency(activity_id uuid references hub_activities(id))",
  );
  await db.query("insert into deletion_unexpected_dependency values($1)", [
    ids[0],
  ]);
  await assert.rejects(command(reviewed.snapshot, requestKey));
  assert.equal(
    (await db.query("select * from hub_cash_receipts")).rows.length,
    1,
  );
  assert.equal(
    (await db.query("select * from hub_attendance_changes")).rows.length,
    1,
  );
  await assert.rejects(db.exec("delete from hub_cash_receipts")); // No transaction-local bypass escaped failure.
  await db.exec("drop table deletion_unexpected_dependency");
  assert.equal((await command(reviewed.snapshot, requestKey)).deleted, true);
  assert.equal((await command(reviewed.snapshot, requestKey)).deleted, true);
  assert.equal((await command("a".repeat(32), requestKey)).code, "conflict");
  assert.equal((await preview()).code, "not_found");
  for (const table of [
    "hub_cash_receipts",
    "hub_cash_allocations",
    "hub_cash_allocation_corrections",
    "hub_registration_charges",
    "hub_attendance",
    "hub_attendance_changes",
    "hub_attendance_requests",
  ])
    assert.equal((await db.query("select * from " + table)).rows.length, 0);
  assert.equal(
    (await db.query("select * from himmah.contacts")).rows.length,
    1,
  );
  assert.equal(
    (await db.query("select * from hub_activity_sessions")).rows.length,
    1,
  );
  assert.equal((await db.query("select * from hub_activities")).rows.length, 3);
  assert.equal(
    (
      await db.query(
        "select * from hub_directory_audit where action like 'activity.delete:%'",
      )
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select * from pg_trigger where not tgisinternal and tgenabled<>'O'",
      )
    ).rows.length,
    0,
  );
  await db.query(
    "update hub_memberships set role='volunteer' where organization_id=$1 and user_id='owner'",
    [org],
  );
  assert.equal(
    (await command(reviewed.snapshot, requestKey)).code,
    "forbidden",
  );
  await db.close();
});
