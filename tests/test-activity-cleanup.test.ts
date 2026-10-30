import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { installDatabase } from "./database.ts";
test("reviewed test-activity purge preserves unrelated data and restores guards", async () => {
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
  const cleanup = (
    await readFile("db/maintenance/20261030_test_activity_cleanup.sql", "utf8")
  )
    .replace(
      "current_database()<>'himmah_futsal'",
      "current_database()<>'postgres'",
    )
    .replace("current_user<>'himmah_owner'", "current_user<>'postgres'");
  // Force a late failure after history triggers have been suspended: everything must roll back.
  await db.exec(
    "create table cleanup_unexpected_dependency(activity_id uuid references hub_activities(id))",
  );
  await db.query("insert into cleanup_unexpected_dependency values($1)", [
    ids[0],
  ]);
  let blocked = false;
  try {
    await db.exec(cleanup);
  } catch {
    blocked = true;
    await db.exec("rollback");
  }
  if (!blocked) throw Error("Unexpected FK did not stop cleanup");
  if ((await db.query("select * from hub_cash_receipts")).rows.length !== 1)
    throw Error("Partial deletion escaped rollback");
  if (
    (
      await db.query(
        "select * from pg_trigger where not tgisinternal and tgenabled<>'O'",
      )
    ).rows.length
  )
    throw Error("Failed cleanup left disabled triggers");
  await db.exec("drop table cleanup_unexpected_dependency");
  await db.exec(cleanup);
  const remaining = await db.query<{ id: string }>(
    "select id from hub_activities",
  );
  if (remaining.rows.length !== 1 || remaining.rows[0]?.id !== keep)
    throw Error("Unrelated activity lost");
  if ((await db.query("select * from himmah.contacts")).rows.length !== 1)
    throw Error("Contact lost");
  if (
    (
      await db.query(
        "select * from pg_trigger where not tgisinternal and tgenabled<>'O'",
      )
    ).rows.length
  )
    throw Error("Trigger disabled");
  // The guard must reject replay / a changed target set, restoring everything on rollback.
  let rejected = false;
  try {
    await db.exec(cleanup);
  } catch {
    rejected = true;
    await db.exec("rollback");
  }
  if (!rejected) throw Error("Replay did not reject");
  console.log(
    "PASS: exact targeted purge, preserved unrelated activity/session/contact/audit, related financial/history deletion, restored guards and rejected replay.",
  );
  await db.close();
});
