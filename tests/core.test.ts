import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { createCommunityStore } from "../src/server/community-store.ts";
import { createStore } from "../src/server/store.ts";
import { createNotificationStore } from "../src/server/notification-store.ts";
import { activityInput, zonedInstant } from "../src/activities/contracts.ts";
import { attendanceInput } from "../src/attendance/contracts.ts";
import { accessInput } from "../src/access/contracts.ts";
import { pageInput, tokenHash } from "../src/community/contracts.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const key = () => crypto.randomUUID();
test("Retained scheduling, attendance, staff access and notifications operate on the clean schema", async (t) => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    // Managed-auth schema is external to the application; reproduce only its read contract.
    await db.exec(
      'create schema neon_auth; create table neon_auth."user" (id uuid primary key, name text)',
    );
    const dialect = new PgDialect(),
      run = async (statement: any) => {
        const q = dialect.sqlToQuery(statement);
        return (await db.query<any>(q.sql, q.params)).rows as Record<
          string,
          unknown
        >[];
      };
    const people = createPeopleStore("", run),
      activities = createActivityStore("", run),
      attendance = createAttendanceStore("", run),
      access = createAccessStore("", run),
      directory = createCommunityStore("", run),
      organizations = createStore("", run),
      notifications = createNotificationStore("", run);
    await db.query<any>(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Community','community','Europe/Brussels','owner',$3),($2,'Other community','other','UTC','other',$4)`,
      [org, other, key(), key()],
    );
    await db.query<any>(
      `insert into hub_memberships(organization_id,user_id,role,display_name) values($1,'owner','owner','Organizer'),($1,'admin','admin','Administrator'),($1,'volunteer','volunteer','Volunteer'),($2,'other','owner','Other')`,
      [org, other],
    );
    const contact = (
      await people.command("owner", org, "create", key(), {
        displayName: "Ali",
        givenName: null,
        familyName: null,
      })
    ).id!;
    const second = (
      await people.command("owner", org, "create", key(), {
        displayName: "Ayşe",
        givenName: null,
        familyName: null,
      })
    ).id!;
    const group = (
      await people.groupCommand("owner", org, "create", key(), {
        name: "Youth",
        description: null,
      })
    ).id!;
    await people.groupCommand("owner", org, "assign", key(), {
      groupId: group,
      version: 1,
      contacts: [{ id: contact, version: 1 }],
    });
    const p = pageInput(new URL("https://himmah.test/?limit=25"), "fixture");
    await t.test(
      "staff resolves current account names without exposing IDs or crossing organization access",
      async () => {
        const staffId = key();
        await db.query(
          'insert into neon_auth."user" (id,name) values ($1,$2)',
          [staffId, "Account name"],
        );
        await db.query(
          "insert into hub_memberships(organization_id,user_id,role) values ($1,$2,'volunteer')",
          [org, staffId],
        );
        const search = { ...p, query: "Account name" };
        assert.equal(
          (await directory.staff("owner", org, search))[0]?.name,
          "Account name",
        );
        assert.equal(
          (await directory.staff("volunteer", org, search)).length,
          0,
        );
        assert.equal((await directory.staff("other", org, search)).length, 0);
        assert.equal((await directory.staff("owner", other, search)).length, 0);
        await db.query('update neon_auth."user" set name=$2 where id=$1', [
          staffId,
          "Renamed account",
        ]);
        assert.equal(
          (await directory.staff("owner", org, { ...p, query: "Renamed" }))[0]
            ?.name,
          "Renamed account",
        );
        assert.equal(
          (await directory.staff("owner", org, { ...p, query: "Organizer" }))[0]
            ?.name,
          "Organizer",
        );
        await db.query("delete from hub_memberships where user_id=$1", [
          staffId,
        ]);
      },
    );
    let activity = "",
      session = "";
    await t.test(
      "canonical People is the activity audience; creation retries and stale edits are scoped",
      async () => {
        const input = activityInput(
            {
              name: "Friday gathering",
              description: "Shared learning",
              location: "Main room",
              audienceGroupIds: [group],
            },
            "Europe/Brussels",
          ),
          k = key();
        activity = String(
          (await activities.create("owner", org, k, input))[0]!.id,
        );
        assert.equal(
          (await activities.create("owner", org, k, input))[0]!.id,
          activity,
        );
        assert.equal(
          (await activities.create("owner", other, key(), input)).length,
          0,
        );
        assert.equal((await activities.get("other", org, activity)).length, 0);
        assert.equal(
          (await activities.create("volunteer", org, key(), input)).length,
          0,
        );
        assert.equal(
          (await activities.update("owner", org, activity, 999, input)).length,
          0,
        );
        assert.equal(
          (await activities.get("owner", org, activity))[0]!.attendancePoints,
          undefined,
        );
        const v = {
          location: "Room two",
          startsAt: "2099-10-28T16:00:00Z",
          endsAt: "2099-10-28T17:00:00Z",
          timezone: "Europe/Brussels",
        };
        session = String(
          (
            await activities.createSession("owner", org, activity, key(), 1, v)
          )[0]!.id,
        );
        assert.equal(
          (await activities.session("owner", org, activity, session))[0]!
            .location,
          "Room two",
        );
        await db.query<any>(
          `update hub_activity_sessions set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=$1`,
          [session],
        );
      },
    );
    await t.test(
      "unknown stays unmarked, correct audience reads through People and attendance saves without earning tables",
      async () => {
        const rows = await attendance.list(
          "owner",
          org,
          activity,
          session,
          p,
          "all",
        );
        assert.deepEqual(
          rows.map((x) => x.id),
          [contact],
        );
        assert.equal(rows[0]!.status, "unmarked");
        // Eligible contacts are searchable, but do not populate the session list until recorded.
        assert.equal(
          (
            await attendance.list(
              "owner",
              org,
              activity,
              session,
              p,
              "all",
              "participants",
            )
          ).length,
          0,
        );
        assert.equal(
          (await attendance.summary("owner", org, activity, session))[0]!.total,
          0,
        );

        const k = key(),
          input = {
            key: k,
            status: "present" as const,
            reason: "",
            items: [{ personId: contact, version: 0 }],
          };
        const first = (
          await attendance.save("owner", org, activity, session, input)
        )[0]!.result as any;
        assert.equal(first.items[0].outcome, "saved");
        assert.equal(first.items[0].pointsDelta, undefined);
        assert.deepEqual(
          (
            await attendance.list(
              "owner",
              org,
              activity,
              session,
              p,
              "all",
              "participants",
            )
          ).map((row) => row.id),
          [contact],
        );
        assert.equal(
          (await attendance.summary("owner", org, activity, session))[0]!
            .present,
          1,
        );

        assert.deepEqual(
          (await attendance.save("owner", org, activity, session, input))[0]!
            .result,
          first,
        );
        assert.equal(
          (
            (
              await attendance.save("owner", org, activity, session, {
                ...input,
                status: "absent",
              })
            )[0]!.result as any
          ).code,
          "attendance_key_conflict",
        );
        let r = (
          await attendance.save("owner", org, activity, session, {
            ...input,
            key: key(),
            status: "absent",
            items: [{ personId: contact, version: 1 }],
          })
        )[0]!.result as any;
        assert.equal(r.items[0].outcome, "reason_required");
        r = (
          await attendance.save("owner", org, activity, session, {
            ...input,
            key: key(),
            status: "absent",
            reason: "Correcting entry",
            items: [{ personId: contact, version: 1 }],
          })
        )[0]!.result as any;
        assert.equal(r.items[0].version, 2);
        assert.equal(
          (
            await attendance.history(
              "owner",
              org,
              activity,
              session,
              contact,
              p,
            )
          ).length,
          2,
        );
        assert.equal(
          (await attendance.summary("owner", org, activity, session))[0]!
            .present,
          0,
        );
      },
    );
    await t.test(
      "volunteers need a scoped attendance grant; revocation denies exact receipt replay",
      async () => {
        assert.equal(
          (await attendance.canSession("volunteer", org, activity, session))
            .length,
          0,
        );
        const grant = accessInput(
          {
            userId: "volunteer",
            groupId: group,
            activityId: null,
            canAttend: true,
          },
          true,
        );
        const r = (await access.save("owner", org, null, key(), grant))[0]!
          .result as any;
        assert.ok(r.id);
        assert.equal((await access.me("volunteer", org))[0]!.canAttend, true);
        assert.equal(
          (await access.me("volunteer", org))[0]!.canAward,
          undefined,
        );
        assert.equal(
          (await activities.get("volunteer", org, activity)).length,
          1,
        );
        assert.deepEqual(
          (
            await attendance.list("volunteer", org, activity, session, p, "all")
          ).map((x) => x.id),
          [contact],
        );
        const input = {
          key: key(),
          status: "present" as const,
          reason: "Staff correction",
          items: [{ personId: contact, version: 2 }],
        };
        assert.equal(
          (
            (
              await attendance.save("volunteer", org, activity, session, input)
            )[0]!.result as any
          ).items[0].outcome,
          "saved",
        );
        await access.save("owner", org, r.id, null, {
          action: "revoke",
          version: 1,
        });
        assert.equal(
          (
            (
              await attendance.save("volunteer", org, activity, session, input)
            )[0]!.result as any
          ).code,
          "forbidden",
        );
      },
    );
    await t.test(
      "audit failure rolls back attendance and receipt, while archived contacts retain existing history",
      async () => {
        await db.exec(
          `create function fail_attendance_audit() returns trigger language plpgsql as $$begin raise exception 'fixture'; end $$;create trigger fail_attendance before insert on hub_attendance_changes for each row execute function fail_attendance_audit();`,
        );
        const input = {
          key: key(),
          status: "excused" as const,
          reason: "Correction",
          items: [{ personId: contact, version: 3 }],
        };
        await assert.rejects(() =>
          attendance.save("owner", org, activity, session, input),
        );
        assert.equal(
          (
            await db.query<any>(
              "select 1 from hub_attendance_requests where request_key=$1",
              [input.key],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query<any>(
              "select version from hub_attendance where person_id=$1",
              [contact],
            )
          ).rows[0]!.version,
          3,
        );
        await db.exec("drop trigger fail_attendance on hub_attendance_changes");
        const c = await people.get("owner", org, contact);
        await people.command("owner", org, "archive", key(), {
          contactId: contact,
          version: c!.version,
        });
        assert.equal(
          (await attendance.list("owner", org, activity, session, p, "all"))[0]!
            .eligible,
          false,
        );
        assert.equal(
          (
            await attendance.history(
              "owner",
              org,
              activity,
              session,
              contact,
              p,
            )
          ).length,
          3,
        );
      },
    );
    await t.test(
      "staff invitations bind recipient email and current inviter authority; participants cannot gain organizations",
      async () => {
        const token = "a".repeat(43),
          hash = await tokenHash(token);
        assert.equal(
          (
            await directory.invite(
              "admin",
              org,
              "staff@example.test",
              "admin",
              key(),
              hash,
            )
          ).length,
          0,
        );
        assert.ok(
          (
            await directory.invite(
              "owner",
              org,
              "staff@example.test",
              "volunteer",
              key(),
              hash,
            )
          )[0],
        );
        assert.equal(
          (
            await directory.accept(
              { id: "new-staff", email: "wrong@example.test", name: "Staff" },
              hash,
            )
          ).length,
          0,
        );
        const staff = {
          id: "new-staff",
          email: "staff@example.test",
          name: "Staff",
        };
        assert.ok((await directory.accept(staff, hash))[0]);
        assert.equal((await organizations.list(staff.id))[0]!.id, org);
        assert.equal(
          (await directory.changeStaff("admin", org, "owner", "owner", null))
            .length,
          0,
        );
        assert.equal(
          (
            await directory.changeStaff(
              "admin",
              org,
              staff.id,
              "volunteer",
              "admin",
            )
          ).length,
          0,
        );
        await directory.changeStaff("owner", org, staff.id, "volunteer", null);
        assert.equal((await organizations.list(staff.id)).length, 0);
        assert.equal(await people.context(staff.id, org), null);
      },
    );
    await t.test(
      "staff notification visibility and device infrastructure have no removed-event dependency",
      async () => {
        await db.query<any>(
          `insert into hub_notifications(organization_id,user_id,event_id,kind,href) values($1,'admin',$2,'staff_notice',$3)`,
          [org, key(), "/workspace/" + org + "/activities"],
        );
        assert.equal((await notifications.list("admin", org, p)).length, 1);
        assert.equal((await notifications.list("owner", org, p)).length, 0);
        await db.query<any>(
          `delete from hub_memberships where organization_id=$1 and user_id='admin'`,
          [org],
        );
        assert.equal((await notifications.list("admin", org, p)).length, 0);
      },
    );
    await t.test(
      "active schema has no dropped tables, fields, functions or permanent-account links",
      async () => {
        const names = (
          await db.query<any>(
            `select tablename from pg_tables where schemaname in ('public','himmah')`,
          )
        ).rows.map((x) => String(x.tablename));
        assert.ok(
          !names.some((n) =>
            /futsal|points|reward|coupon|challenge|participant|engagement|period_(members|groups)|attendance_awards/.test(
              n,
            ),
          ),
        );
        const cols = await db.query<any>(
          `select column_name from information_schema.columns where table_schema in('public','himmah') and column_name in('attendance_points','earning_rule_version','can_award','participant_link_id')`,
        );
        assert.equal(cols.rows.length, 0);
        assert.throws(() =>
          activityInput(
            {
              name: "Test",
              description: "",
              location: "",
              audienceGroupIds: [],
              attendancePoints: 10,
            },
            "UTC",
          ),
        );
        assert.throws(() =>
          attendanceInput({
            key: key(),
            status: "present",
            reason: "",
            items: [{ personId: second, version: 0 }],
            confirmPoints: true,
          }),
        );
        assert.throws(() =>
          accessInput({ canAttend: true, canAward: true }, false),
        );
      },
    );
  } finally {
    await db.close();
  }
});
test("scheduling keeps strict DST validation after removing earning rules", () => {
  assert.throws(() => zonedInstant("2026-03-29T02:30", "Europe/Brussels"));
  assert.throws(() => zonedInstant("2026-10-25T02:30", "Europe/Brussels"));
  assert.equal(
    zonedInstant("2026-10-28T19:00", "Europe/Brussels"),
    "2026-10-28T18:00:00.000Z",
  );
});
