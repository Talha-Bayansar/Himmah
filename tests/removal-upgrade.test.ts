import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const previous = "2b99501e0a4fb5fc2467180aef080bb079a9d563";
const historical = (path: string) =>
  execFileSync("git", ["show", previous + ":" + path], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
test("Owner-authorized upgrade deletes removed products, preserves retained identities and fails atomically on unknown dependencies", async (t) => {
  const db = new PGlite();
  try {
    const paths = execFileSync(
      "git",
      [
        "ls-tree",
        "-r",
        "--name-only",
        previous,
        "db/migrations/generated",
        "db/rebuild/generated",
      ],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter((f) => f.endsWith(".sql"));
    for (const path of paths) await db.exec(historical(path));
    for (const name of ["contacts", "directory", "communication", "hosting"])
      await db.exec(historical("db/rebuild/" + name + ".sql"));
    await db.exec(
      `CREATE TABLE himmah.installation_receipts(digest text PRIMARY KEY);INSERT INTO himmah.installation_receipts VALUES('34a238dbb6cf28718c9e6dc5a470ed8020e67de444a6de171b505b91ce581ce7');`,
    );
    const org = crypto.randomUUID(),
      person = crypto.randomUUID(),
      group = crypto.randomUUID(),
      activity = crypto.randomUUID(),
      session = crypto.randomUUID();
    await db.query<any>(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Community','community','UTC','owner',gen_random_uuid())`,
      [org],
    );
    await db.query<any>(
      `insert into hub_memberships(organization_id,user_id,role) values($1,'owner','owner'),($1,'volunteer','volunteer')`,
      [org],
    );
    await db.query<any>(
      `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,'Retained contact','owner',gen_random_uuid(),'owner')`,
      [person, org],
    );
    await db.query<any>(
      `insert into hub_groups(id,organization_id,name,created_by,creation_key) values($1,$2,'Retained group','owner',gen_random_uuid())`,
      [group, org],
    );
    await db.query<any>(
      `insert into hub_group_people(organization_id,group_id,person_id) values($1,$2,$3)`,
      [org, group, person],
    );
    await db.query<any>(
      `insert into hub_activities(id,organization_id,name,timezone,attendance_points,created_by,creation_key) values($1,$2,'Retained activity','UTC',10,'owner',gen_random_uuid())`,
      [activity, org],
    );
    await db.query<any>(
      `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,attendance_points,earning_rule_version,created_by,creation_key) values($1,$2,$3,'Saved session','','','UTC',now()-interval '1 hour',now()+interval '1 hour',10,1,'owner',gen_random_uuid())`,
      [session, org, activity],
    );
    const archived = crypto.randomUUID();
    await db.query<any>(
      `insert into hub_people(id,organization_id,name,archived,created_by,creation_key,consent_recorded_by) values($1,$2,'Archived contact',true,'owner',gen_random_uuid(),'owner')`,
      [archived, org],
    );
    await db.query<any>(
      `insert into hub_group_people(organization_id,group_id,person_id) values($1,$2,$3)`,
      [org, group, archived],
    );
    const payload = {
      status: "present",
      reason: "",
      items: [{ personId: person, version: 0 }],
      confirmPoints: true,
    };
    await db.query<any>(
      `select hub_save_attendance('owner',$1,$2,$3,$4,$5::jsonb)`,
      [org, activity, session, crypto.randomUUID(), JSON.stringify(payload)],
    );
    assert.equal(
      (await db.query<any>(`select count(*)::int n from hub_points_entries`))
        .rows[0]!.n,
      1,
    );
    await db.query<any>(
      `select hub_save_access('owner',$1,null,$2,$3::jsonb)`,
      [
        org,
        crypto.randomUUID(),
        JSON.stringify({
          userId: "volunteer",
          groupId: group,
          canAttend: true,
          canAward: true,
        }),
      ],
    );
    const source = await readFile(
      "db/removals/20261028_remove_dropped_features.sql",
      "utf8",
    );
    // PGlite's database/user are fixed; remote execution retains the exact identity checks.
    const cleanup = source.replace(
      "current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR ",
      "",
    );
    const apply = () =>
      db.transaction(async (tx) => {
        await tx.exec(cleanup);
        for (const name of [
          "people-adapter",
          "access",
          "attendance",
          "notifications",
        ])
          await tx.exec(
            await readFile("db/migrations/functions/" + name + ".sql", "utf8"),
          );
      });
    await t.test(
      "unexpected dependencies stop the transaction without dropping or moving data",
      async () => {
        await db.exec(
          "create view public.unexpected_dependency as select * from hub_rewards",
        );
        await assert.rejects(apply);
        assert.equal(
          (
            await db.query<any>(
              `select count(*)::int n from hub_points_entries`,
            )
          ).rows[0]!.n,
          1,
        );
        assert.equal(
          (await db.query<any>(`select count(*)::int n from himmah.contacts`))
            .rows[0]!.n,
          0,
        );
        await db.exec("drop view public.unexpected_dependency");
      },
    );
    await apply();
    const ended = (
      await db.query<any>(
        `select valid_to,end_reason from himmah.group_memberships where contact_id=$1`,
        [archived],
      )
    ).rows[0]!;
    assert.ok(ended.valid_to);
    assert.equal(ended.end_reason, "contact_archived");
    assert.equal(
      (
        await db.query<any>(
          `select archived_by from himmah.contacts where id=$1`,
          [archived],
        )
      ).rows[0]!.archived_by,
      "system:legacy-cutover",
    );

    await t.test(
      "removed relations/functions/fields and embedded earning data are absent",
      async () => {
        const tables = (
          await db.query<any>(
            `select tablename from pg_tables where schemaname='public'`,
          )
        ).rows.map((r) => r.tablename);
        assert.ok(
          !tables.some((n) =>
            /points|reward|coupon|challenge|futsal|participant|engagement|period_|attendance_awards|^hub_(people|groups|group_people)$/.test(
              String(n),
            ),
          ),
        );
        const functions = await db.query<any>(
          `select proname from pg_proc where pronamespace='public'::regnamespace and proname ~ '(points|reward|coupon|challenge|futsal|participant|period_|attendance_operation|preview_attendance)'`,
        );
        assert.equal(functions.rows.length, 0);
        const receipt = (
          await db.query<any>(
            `select payload,response from hub_attendance_requests`,
          )
        ).rows[0]!;
        assert.ok(!JSON.stringify(receipt).match(/pointsDelta|confirmPoints/));
        assert.ok(
          !(
            await db.query<any>(
              `select before,after from hub_volunteer_assignment_changes`,
            )
          ).rows.some((r) => JSON.stringify(r).includes("can_award")),
        );
      },
    );
    await t.test(
      "contacts, group membership, activities, attendance and staff access survive the single-directory cutover",
      async () => {
        assert.equal(
          (
            await db.query<any>(
              `select display_name from himmah.contacts where id=$1`,
              [person],
            )
          ).rows[0]!.display_name,
          "Retained contact",
        );
        assert.equal(
          (
            await db.query<any>(
              `select count(*)::int n from himmah.group_memberships where contact_id=$1 and group_id=$2 and valid_to is null`,
              [person, group],
            )
          ).rows[0]!.n,
          1,
        );
        assert.equal(
          (
            await db.query<any>(
              `select status from hub_attendance where person_id=$1`,
              [person],
            )
          ).rows[0]!.status,
          "present",
        );
        assert.equal(
          (
            await db.query<any>(
              `select hub_can_attend_person('volunteer',$1,$2,$3,$4) allowed`,
              [org, activity, session, person],
            )
          ).rows[0]!.allowed,
          true,
        );
        await db.query<any>(
          `update hub_memberships set role='admin' where user_id='volunteer'`,
        );
        assert.equal(
          (
            await db.query<any>(
              `select count(*)::int n from hub_active_access('volunteer',$1)`,
              [org],
            )
          ).rows[0]!.n,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});
