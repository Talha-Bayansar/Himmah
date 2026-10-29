import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createCashStore } from "../src/server/cash-store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { attendanceMembershipInput } from "../src/attendance/contracts.ts";
import { pageInput } from "../src/community/contracts.ts";

test("unified session management is atomic, scoped, versioned and preserves correction history", async (t) => {
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
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Session','session','UTC','owner',gen_random_uuid())`,
      [org],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner'),($1,'helper','volunteer'),($1,'other','volunteer')`,
      [org],
    );
    const people = createPeopleStore("", run),
      activities = createActivityStore("", run),
      attendance = createAttendanceStore("", run),
      cash = createCashStore("", run),
      access = createAccessStore("", run);
    const ids = [] as string[];
    for (const name of ["First", "Second", "Third"])
      ids.push(
        String(
          (
            await people.command("owner", org, "create", key(), {
              displayName: name,
              givenName: null,
              familyName: null,
            })
          ).id,
        ),
      );
    const activity = String(
      (
        await activities.create("owner", org, key(), {
          name: "Paid session",
          description: "",
          location: "",
          timezone: "UTC",
          audienceGroupIds: [],
          priceMinor: 1000,
        })
      )[0]!.id,
    );
    const session = String(
      (
        await activities.createSession("owner", org, activity, key(), 1, {
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 90000000).toISOString(),
          location: "",
          timezone: "UTC",
        })
      )[0]!.id,
    );
    await db.query(
      `update hub_activity_sessions set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=$1`,
      [session],
    );
    await access.save("owner", org, null, key(), {
      userId: "helper",
      activityId: activity,
      groupId: null,
      canAttend: true,
      canCollect: true,
    });
    await access.save("owner", org, null, key(), {
      userId: "other",
      activityId: activity,
      groupId: null,
      canAttend: true,
      canCollect: false,
    });
    const p = pageInput(new URL("https://himmah.test"), "management");
    const list = () =>
      attendance.list(
        "owner",
        org,
        activity,
        session,
        p,
        "all",
        "participants",
      );
    const stats = async () =>
      (await attendance.summary("owner", org, activity, session))[0]!;
    const snapshots = async (targets = ids.slice(0, 2)) =>
      Promise.all(
        targets.map(async (id) => {
          const row = (
            await attendance.list("owner", org, activity, session, p, "all")
          ).find((x) => x.id === id)!;
          const bill = row.billing as any;
          return {
            personId: id,
            version: Number(row.version),
            ...(bill
              ? {
                  paymentVersion: bill.version,
                  sessionVersion: bill.sessionVersion,
                  amountMinor: bill.outstandingMinor,
                }
              : {}),
          };
        }),
      );
    const command = async (
      action: string,
      items: any[],
      request: string = key(),
      actor = "owner",
    ) =>
      (
        await attendance.manage(
          actor,
          org,
          activity,
          session,
          attendanceMembershipInput({ key: request, action, items }),
        )
      )[0]!.result as any;
    const count = async (table: string) =>
      (await db.query<any>(`select count(*)::int n from ${table}`)).rows[0]!.n;
    await t.test(
      "bulk add and disabled picker data include present people without duplicate attendance",
      async () => {
        assert.equal((await command("add", await snapshots())).items.length, 2);
        assert.equal((await list()).length, 2);
        assert.equal((await stats()).unpaid, 2);
        assert.equal(
          (
            await attendance.list(
              "owner",
              org,
              activity,
              session,
              p,
              "all",
              "picker",
            )
          ).length,
          3,
        );
        assert.equal(
          (
            await attendance.list(
              "owner",
              org,
              activity,
              session,
              p,
              "all",
              "available",
            )
          ).length,
          1,
        );
        assert.equal(
          (await command("add", await snapshots())).code,
          "conflict",
        );
      },
    );
    let paidRequest = "",
      paidItems: any[] = [];
    await t.test(
      "bulk paid uses reviewed remaining amounts and exact retry",
      async () => {
        paidRequest = key();
        paidItems = await snapshots();
        const result = await command("paid", paidItems, paidRequest);
        assert.equal(result.amountMinor, 2000);
        assert.deepEqual(await command("paid", paidItems, paidRequest), result);
        assert.equal(await count("hub_cash_receipts"), 2);
        assert.equal((await stats()).paid, 2);
        assert.equal((await stats()).paidMinor, 2000);
      },
    );
    await t.test(
      "mark unpaid corrects only the selected person and updates totals",
      async () => {
        assert.ok(!(await command("unpaid", await snapshots([ids[0]!]))).code);
        assert.equal((await stats()).paid, 1);
        assert.equal((await stats()).unpaid, 1);
        assert.equal((await stats()).outstandingMinor, 1000);
        assert.equal(
          (await cash.summary("owner", org, activity, session))[0]!
            .collectedMinor,
          1000,
        );
        const history = await cash.history("owner", org, activity, session, p);
        assert.equal(
          history.filter((x) => x.correctedMinor === 1000).length,
          1,
        );
        assert.equal(await count("hub_cash_receipts"), 2);
        assert.equal(await count("hub_cash_allocation_corrections"), 1);
      },
    );
    await t.test(
      "a stale second snapshot rolls the whole payment batch back",
      async () => {
        const items = await snapshots();
        items[1]!.version = 999;
        items[1]!.amountMinor = 1000;
        assert.equal((await command("paid", items)).code, "conflict");
        assert.equal(await count("hub_cash_receipts"), 2);
        assert.equal((await stats()).paid, 1);
      },
    );
    await t.test(
      "attendance-only cannot clear paid contacts; collect revocation denies financial replay",
      async () => {
        assert.equal(
          (await command("remove", await snapshots([ids[1]!]), key(), "other"))
            .code,
          "forbidden",
        );
        assert.equal((await list()).length, 2);
        const req = key(),
          items = await snapshots([ids[0]!]);
        assert.ok(!(await command("paid", items, req, "helper")).code);
        await db.query(
          `update hub_volunteer_assignments set can_collect=false where organization_id=$1 and user_id='helper'`,
          [org],
        );
        assert.equal(
          (await command("paid", items, req, "helper")).code,
          "forbidden",
        );
      },
    );
    await t.test(
      "bulk remove clears payments, re-add starts unpaid, and history remains immutable",
      async () => {
        const items = await snapshots(),
          req = key();
        const result = await command("remove", items, req);
        assert.deepEqual(await command("remove", items, req), result);
        assert.equal((await list()).length, 0);
        assert.equal((await stats()).paidMinor, 0);
        assert.ok(!(await command("add", await snapshots())).code);
        assert.equal((await stats()).paid, 0);
        assert.equal((await stats()).unpaid, 2);
        assert.equal(await count("hub_cash_receipts"), 3);
        await assert.rejects(
          db.query(
            `delete from hub_cash_allocation_corrections where organization_id=$1`,
            [org],
          ),
        );
      },
    );
    await t.test(
      "audit failure rolls back payment and correction together",
      async () => {
        await db.exec(
          `create function reject_manage_audit()returns trigger language plpgsql as $$begin if new.action='participants.paid' then raise exception 'audit unavailable';end if;return new;end$$;create trigger reject_manage_audit before insert on hub_directory_audit for each row execute function reject_manage_audit();`,
        );
        await assert.rejects(command("paid", await snapshots()));
        assert.equal(await count("hub_cash_receipts"), 3);
        assert.equal((await stats()).paid, 0);
      },
    );
  } finally {
    await db.close();
  }
});
