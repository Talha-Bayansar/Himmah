import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { activityApi } from "../src/server/activity-api.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createRegistrationStore } from "../src/server/registration-store.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createStore } from "../src/server/store.ts";
import { registrationApi } from "../src/server/registration-api.ts";
import { pageInput } from "../src/community/contracts.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  key = () => crypto.randomUUID();
test("Session registration SQL/API enforces reservations, frozen rosters, history and scope independently of attendance", async (t) => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      run = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
      };
    const store = createRegistrationStore("", run),
      people = createPeopleStore("", run),
      activities = createActivityStore("", run),
      organizations = createStore("", run);
    await db.query<any>(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Community','community','UTC','owner',$3),($2,'Other','other','UTC','other',$4)`,
      [org, other, key(), key()],
    );
    await db.query<any>(
      `insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner'),($1,'admin','admin'),($1,'volunteer','volunteer'),($2,'other','owner')`,
      [org, other],
    );
    const contact = async (name: string, o = org) =>
      String(
        (
          await people.command(
            o === org ? "owner" : "other",
            o,
            "create",
            key(),
            { displayName: name, givenName: null, familyName: null },
          )
        ).id,
      );
    const a = await contact("Ali"),
      b = await contact("Bob"),
      foreign = await contact("Foreign", other);
    const activity = String(
      (
        await activities.create("owner", org, key(), {
          name: "Gathering",
          description: "",
          location: "",
          timezone: "UTC",
          audienceGroupIds: [],
        })
      )[0]!.id,
    );
    const makeSession = async (
      startsAt = new Date(Date.now() + 86400000).toISOString(),
    ) =>
      String(
        (
          await activities.createSession("owner", org, activity, key(), 1, {
            startsAt,
            endsAt: new Date(Date.parse(startsAt) + 3600000).toISOString(),
            location: "",
            timezone: "UTC",
          })
        )[0]!.id,
      );
    const session = await makeSession();
    const command = async (
      s: string,
      payload: Record<string, unknown>,
      actor = "owner",
      k = key(),
      o = org,
    ) =>
      (await store.command(actor, o, activity, s, k, payload))[0]!
        .result as any;
    const summary = async (s = session, actor = "owner") =>
      (await store.summary(actor, org, activity, s))[0]!.result as any;
    const p = pageInput(new URL("https://himmah.test/?limit=1"), "fixture");
    await t.test(
      "open sessions default to optional registration and no expected denominator",
      async () => {
        const s = await summary();
        assert.equal(s.mode, "open");
        assert.equal(s.expected, null);
        assert.equal(s.version, 0);
        assert.equal(s.remaining, null);
        assert.equal(
          (await db.query<any>(`select count(*)::int as n from hub_attendance`))
            .rows[0]!.n,
          0,
        );
      },
    );
    await t.test(
      "one last place, exact retry, changed key payload and cancellation/re-registration",
      async () => {
        assert.equal(
          (
            await command(session, {
              action: "configure",
              version: 0,
              mode: "required",
              capacity: 1,
            })
          ).version,
          1,
        );
        const k = key(),
          payload = {
            action: "register",
            personId: a,
            contactVersion: 1,
            version: 0,
            reason: "",
          };
        const results = await Promise.all([
          command(session, payload, "owner", k),
          command(session, { ...payload, personId: b }),
        ]);
        assert.equal(results.filter((r) => r.id).length, 1);
        assert.equal(
          results.filter((r) => r.code === "registration_capacity").length,
          1,
        );
        assert.deepEqual(
          await command(session, payload, "owner", k),
          results[0],
        );
        assert.equal(
          (
            await command(
              session,
              { ...payload, reason: "Changed" },
              "owner",
              k,
            )
          ).code,
          "registration_key",
        );
        assert.equal(
          (
            await command(session, {
              action: "configure",
              version: 1,
              mode: "required",
              capacity: 0,
            })
          ).code,
          "invalid_input",
        );
        assert.equal(
          (
            await command(session, {
              action: "cancel",
              personId: a,
              version: 1,
              reason: "",
            })
          ).code,
          "registration_reason",
        );
        assert.equal(
          (
            await command(session, {
              action: "cancel",
              personId: a,
              version: 1,
              reason: "Cannot attend",
            })
          ).version,
          2,
        );
        assert.equal((await summary()).remaining, 1);
        assert.equal(
          (await command(session, { ...payload, version: 2 })).version,
          3,
        );
        assert.equal((await summary()).confirmed, 1);
        assert.equal(
          (await db.query<any>(`select count(*)::int n from hub_attendance`))
            .rows[0]!.n,
          0,
        );
      },
    );
    await t.test(
      "tenant, volunteer and replay authorization remain current",
      async () => {
        const payload = {
          action: "register",
          personId: b,
          contactVersion: 1,
          version: 0,
          reason: "",
        };
        assert.equal(
          (await command(session, payload, "other")).code,
          "forbidden",
        );
        assert.equal(
          (await command(session, payload, "volunteer")).code,
          "forbidden",
        );
        assert.equal(
          (await command(session, { ...payload, personId: foreign })).code,
          "registration_ineligible",
        );
        const s = await makeSession(),
          k = key();
        assert.ok((await command(s, payload, "admin", k)).id);
        await db.query<any>(
          `delete from hub_memberships where organization_id=$1 and user_id='admin'`,
          [org],
        );
        assert.equal((await command(s, payload, "admin", k)).code, "forbidden");
        assert.deepEqual(
          await store.list("other", org, activity, s, p, "confirmed"),
          [],
        );
        await assert.rejects(
          db.query(
            `insert into hub_session_registrations(organization_id,activity_id,session_id,person_id,status,source)values($1,$2,$3,$4,'confirmed','advance')`,
            [org, activity, s, foreign],
          ),
        );
      },
    );
    await t.test(
      "API rejects invalid input, unverified users and cross-filter cursor reuse",
      async () => {
        const path = `https://himmah.test/api/organizations/${org}/activities/${activity}/sessions/${session}/registrations`,
          user = { id: "owner", emailVerified: true };
        const response = await registrationApi(
          new Request(path),
          user,
          organizations,
          store,
        );
        assert.equal(response?.status, 200);
        assert.equal(response?.headers.get("Cache-Control"), "no-store");
        const unverified = await registrationApi(
          new Request(path),
          { ...user, emailVerified: false },
          organizations,
          store,
        );
        assert.equal(unverified?.status, 403);
        assert.equal(
          (
            await registrationApi(
              new Request(path, {
                method: "POST",
                body: JSON.stringify({
                  action: "configure",
                  key: key(),
                  version: 1,
                  mode: "required",
                  capacity: 1.5,
                }),
              }),
              user,
              organizations,
              store,
            )
          )?.status,
          400,
        );
        const s = await makeSession();
        for (const personId of [a, b])
          await command(s, {
            action: "register",
            personId,
            version: 0,
            contactVersion: 1,
            reason: "",
          });
        const base = path.replace(session, s);
        const first = (await (await registrationApi(
          new Request(base + "?limit=1"),
          user,
          organizations,
          store,
        ))!.json()) as any;
        assert.ok(first.nextCursor);
        const second = (await (await registrationApi(
          new Request(
            base + "?limit=1&cursor=" + encodeURIComponent(first.nextCursor),
          ),
          user,
          organizations,
          store,
        ))!.json()) as any;
        assert.notEqual(first.items[0].id, second.items[0].id);
        assert.equal(
          (
            await registrationApi(
              new Request(
                base +
                  "?limit=1&view=cancelled&cursor=" +
                  encodeURIComponent(first.nextCursor),
              ),
              user,
              organizations,
              store,
            )
          )?.status,
          400,
        );
      },
    );
    await t.test(
      "freeze preserves the original roster and audits late registration/cancellation without attendance writes",
      async () => {
        const s = await makeSession(
          new Date(Date.now() + 1805000).toISOString(),
        );
        await command(s, {
          action: "configure",
          version: 0,
          mode: "required",
          capacity: 3,
        });
        await command(s, {
          action: "register",
          personId: a,
          version: 0,
          contactVersion: 1,
          reason: "",
        });
        // Let the real check-in cutoff pass; no test-only bypass of the schedule guard.
        await new Promise((r) => setTimeout(r, 5100));
        const frozen = await summary(s);
        assert.ok(frozen.frozenAt);
        assert.equal(frozen.originalExpected, 1);
        assert.equal(frozen.expected, 1);
        assert.equal(
          (
            await command(s, {
              action: "configure",
              version: 1,
              mode: "open",
              capacity: null,
            })
          ).code,
          "registration_locked",
        );
        assert.equal(
          (
            await command(s, {
              action: "register",
              personId: b,
              version: 0,
              contactVersion: 1,
              reason: "",
            })
          ).code,
          "registration_reason",
        );
        await command(s, {
          action: "register",
          personId: b,
          version: 0,
          contactVersion: 1,
          reason: "Late reservation",
        });
        await command(s, {
          action: "cancel",
          personId: a,
          version: 1,
          reason: "No longer coming",
        });
        const after = await summary(s);
        assert.equal(after.originalExpected, 1);
        assert.equal(after.expected, 1);
        const original = await store.list(
            "owner",
            org,
            activity,
            s,
            { ...p, limit: 25 },
            "original",
          ),
          current = await store.list(
            "owner",
            org,
            activity,
            s,
            { ...p, limit: 25 },
            "expected",
          );
        assert.equal(original[0]!.personId, a);
        assert.equal(current[0]!.personId, b);
        assert.deepEqual(
          await activities.updateSession("owner", org, activity, s, 1, {
            startsAt: new Date(Date.now() + 7200000).toISOString(),
            endsAt: new Date(Date.now() + 10800000).toISOString(),
            location: "Changed",
            timezone: "UTC",
          }),
          [],
        );
        assert.equal(
          (await db.query<any>(`select count(*)::int n from hub_attendance`))
            .rows[0]!.n,
          0,
        );
        const attendance = createAttendanceStore("", run);
        const expectedRows = await attendance.list(
          "owner",
          org,
          activity,
          s,
          { ...p, limit: 25 },
          "all",
          "expected",
        );
        assert.equal(expectedRows[0]!.id, b);
        assert.equal(expectedRows[0]!.status, "unmarked");
        const access = createAccessStore("", run);
        const grant = (
          await access.save("owner", org, null, key(), {
            userId: "volunteer",
            groupId: null,
            activityId: activity,
            canAttend: true,
          })
        )[0]!.result as any;
        const walkKey = key(),
          payload = {
            action: "register",
            personId: a,
            contactVersion: 1,
            version: 2,
            reason: "Added during check-in",
          };
        assert.ok((await command(s, payload, "volunteer", walkKey)).id);
        assert.equal(
          (
            await command(
              s,
              { action: "cancel", personId: a, version: 3, reason: "Cancel" },
              "volunteer",
            )
          ).code,
          "forbidden",
        );
        await access.save("owner", org, grant.id, null, {
          action: "revoke",
          version: 1,
        });
        assert.equal(
          (await command(s, payload, "volunteer", walkKey)).code,
          "forbidden",
        );
        assert.equal((await summary(s)).originalExpected, 1);
        assert.equal((await summary(s)).expected, 2);
        await assert.rejects(
          db.query(
            `update hub_session_registration_events set reason='rewrite' where session_id=$1`,
            [s],
          ),
        );
      },
    );
    await t.test(
      "walk-in attendance creates no reservation and cancellation preserves reservation history",
      async () => {
        const s = await makeSession();
        await db.query(
          "update hub_activity_sessions set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=$1",
          [s],
        );
        const attendance = createAttendanceStore("", run);
        const mark = (
          await attendance.save("owner", org, activity, s, {
            key: key(),
            status: "present",
            reason: "",
            items: [{ personId: a, version: 0 }],
          })
        )[0]!.result as any;
        assert.equal(mark.items[0].outcome, "saved");
        assert.equal((await summary(s)).confirmed, 0);
        assert.equal((await summary(s)).expected, null);
        const upcoming = await makeSession();
        await command(upcoming, {
          action: "register",
          personId: a,
          version: 0,
          contactVersion: 1,
          reason: "",
        });
        await activities.cancelSession(
          "owner",
          org,
          activity,
          upcoming,
          1,
          "Session cancelled",
        );
        assert.equal(
          (
            await command(upcoming, {
              action: "register",
              personId: b,
              version: 0,
              contactVersion: 1,
              reason: "",
            })
          ).code,
          "registration_closed",
        );
        assert.equal((await summary(upcoming)).confirmed, 1);
        assert.equal(
          (
            await store.list(
              "owner",
              org,
              activity,
              upcoming,
              { ...p, limit: 25 },
              "history",
            )
          ).length,
          1,
        );
      },
    );
    await t.test(
      "editing retained activity metadata no longer injects a removed earning field",
      async () => {
        const fresh = String(
          (
            await activities.create("owner", org, key(), {
              name: "Fresh activity",
              description: "",
              location: "",
              timezone: "UTC",
              audienceGroupIds: [],
            })
          )[0]!.id,
        );
        const response = await activityApi(
          new Request(
            `https://himmah.test/api/organizations/${org}/activities/${fresh}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                name: "Updated activity",
                description: "",
                location: "",
                audienceGroupIds: [],
                version: 1,
              }),
            },
          ),
          { id: "owner", emailVerified: true },
          organizations,
          activities,
        );
        assert.equal(response?.status, 200);
        assert.equal(
          ((await response!.json()) as any).item.name,
          "Updated activity",
        );
      },
    );
    await t.test(
      "audit failure rolls back reservation and receipt together",
      async () => {
        const s = await makeSession();
        await db.exec(
          `create function reject_registration_event() returns trigger language plpgsql as $$ begin if NEW.action='register' then raise exception 'audit unavailable'; end if; return NEW;end;$$; create trigger reject_registration_event before insert on hub_session_registration_events for each row execute function reject_registration_event();`,
        );
        await assert.rejects(
          command(s, {
            action: "register",
            personId: a,
            version: 0,
            contactVersion: 1,
            reason: "",
          }),
        );
        assert.equal(
          (
            await db.query<any>(
              `select count(*)::int n from hub_session_registrations where session_id=$1`,
              [s],
            )
          ).rows[0]!.n,
          0,
        );
        assert.equal(
          (
            await db.query<any>(
              `select count(*)::int n from hub_session_registration_requests where session_id=$1`,
              [s],
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
