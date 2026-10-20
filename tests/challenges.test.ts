import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createChallengeStore } from "../src/server/challenge-store.ts";
import { createParticipantStore } from "../src/server/participant-store.ts";
import { createPointsStore } from "../src/server/points-store.ts";
import { createStore } from "../src/server/store.ts";
import { challengeApi } from "../src/server/challenge-api.ts";
import { challengeInput, challengeNote } from "../src/challenges/contracts.ts";
import { newToken, tokenHash, pageInput } from "../src/community/contracts.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  origin = "https://test.invalid";
test("challenge validation bounds points, private notes, groups and ambiguous local dates", () => {
  const input = {
    name: "Help out",
    description: "Help prepare the event",
    points: 15,
    groups: [],
    startsAt: "",
    endsAt: "",
  };
  assert.equal(challengeInput(input, "UTC").startsAt, null);
  for (const change of [
    { points: 0 },
    { points: 10001 },
    { description: "" },
    { groups: ["bad"] },
    { startsAt: "2026-10-25T02:30" },
  ])
    assert.throws(() =>
      challengeInput({ ...input, ...change }, "Europe/Brussels"),
    );
  assert.throws(() => challengeNote("x".repeat(501)));
  assert.throws(() => challengeNote("", 300, true));
});
test("PostgreSQL challenges: eligibility, frozen rules, private submissions, decisions, exactly-once points, corrections and revocation", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../db/migrations/generated/", import.meta.url),
      journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", dir), "utf8"),
      );
    for (const e of journal.entries)
      await db.exec(await readFile(new URL(e.tag + ".sql", dir), "utf8"));
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Test A','test-a','UTC','owner-a',$3),($2,'Test B','test-b','UTC','owner-b',$4)`,
      [org, other, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role,display_name) values($1,'owner-a','owner','Organizer'),($1,'admin-a','admin','Admin'),($1,'vol-a','volunteer','Volunteer'),($2,'owner-b','owner','Other')`,
      [org, other],
    );
    const people = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    for (const [i, id] of people.entries())
      await db.query(
        `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,$3,'owner-a',$4,'owner-a')`,
        [id, org, "Member " + i, crypto.randomUUID()],
      );
    const dialect = new PgDialect(),
      execute = async (st: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query(q.sql, q.params)).rows as Record<
          string,
          unknown
        >[];
      },
      url = "postgresql://test:test@localhost/test",
      store = createChallengeStore(url, execute),
      participants = createParticipantStore(url, execute),
      points = createPointsStore(url, execute),
      organizations = createStore(url, execute);
    const users = people.slice(0, 2).map((_, i) => ({
      id: "child-" + i,
      name: "Nickname",
      email: i + "@example.invalid",
      emailVerified: true,
    }));
    for (const [i, u] of users.entries()) {
      const hash = await tokenHash(newToken());
      await participants.invite(
        "owner-a",
        org,
        people[i]!,
        crypto.randomUUID(),
        u.email,
        hash,
        true,
      );
      await participants.accept(u, hash);
    }
    const result = (rows: Record<string, unknown>[]) =>
      rows[0]!.result as { id?: string; code?: string };
    const group = crypto.randomUUID();
    await db.query(
      `insert into hub_groups(id,organization_id,name,created_by,creation_key) values($1,$2,'Study group','owner-a',$3)`,
      [group, org, crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_group_people(organization_id,group_id,person_id) values($1,$2,$3)`,
      [org, group, people[0]],
    );
    const create = {
        action: "create",
        name: "Help prepare an event",
        description: "Work with an organizer",
        points: 15,
        groups: [group],
        startsAt: null,
        endsAt: null,
      },
      key = crypto.randomUUID();
    const id = result(await store.save("owner-a", org, null, key, create)).id!;
    assert(id);
    assert.equal(
      result(await store.save("owner-a", org, null, key, create)).id,
      id,
    );
    assert.equal(
      result(await store.save("admin-a", org, null, key, create)).code,
      "conflict",
    );
    assert.equal((await store.get(users[0]!.id, org, id, true)).length, 0);
    assert.equal(
      result(
        await store.save("vol-a", org, id, crypto.randomUUID(), {
          action: "publish",
          version: 1,
        }),
      ).code,
      "forbidden",
    );
    await store.save("owner-a", org, id, crypto.randomUUID(), {
      action: "publish",
      version: 1,
    });
    assert.equal(
      result(
        await store.save("owner-a", org, id, crypto.randomUUID(), {
          ...create,
          action: "edit",
          version: 2,
        }),
      ).code,
      "conflict",
    );
    assert.equal((await store.get(users[1]!.id, org, id, true)).length, 0);
    const submit = {
        action: "submit",
        note: "Completed with help",
        challengeVersion: 2,
        version: null,
      },
      sk = crypto.randomUUID();
    const sid = result(
      await store.submit(users[0]!.id, org, id, sk, submit),
    ).id!;
    assert(sid);
    assert.equal(
      result(await store.submit(users[0]!.id, org, id, sk, submit)).id,
      sid,
    );
    assert.equal(
      result(
        await store.submit(users[0]!.id, org, id, sk, {
          ...submit,
          note: "changed",
        }),
      ).code,
      "conflict",
    );
    assert.equal(
      result(
        await store.submit(users[1]!.id, org, id, crypto.randomUUID(), submit),
      ).code,
      "forbidden",
    );
    assert.equal((await store.get("owner-b", other, id, false)).length, 0);
    assert.equal(
      (
        await store.submissions(
          users[0]!.id,
          org,
          id,
          pageInput(new URL(origin), "x"),
          "all",
        )
      ).length,
      0,
    );
    const own = (await store.get(users[0]!.id, org, id, true))[0]!
      .submission as Record<string, unknown>;
    assert.equal(own.id, sid);
    assert.equal("reviewedBy" in own, false);
    assert.equal("personId" in own, false);
    const review = { action: "approve", version: 1, feedback: "Thank you" };
    const concurrent = await Promise.all([
      store.review("owner-a", org, id, sid, crypto.randomUUID(), review),
      store.review("admin-a", org, id, sid, crypto.randomUUID(), {
        action: "reject",
        version: 1,
        feedback: "Try again",
      }),
    ]);
    assert.equal(concurrent.map(result).filter((r) => r.id).length, 1);
    // Whichever decision won, finish through the permitted retry path.
    let record = (await store.submission("owner-a", org, id, sid))[0]!;
    if (record.status === "rejected") {
      await store.submit(users[0]!.id, org, id, crypto.randomUUID(), {
        ...submit,
        version: 2,
      });
      await store.review("owner-a", org, id, sid, crypto.randomUUID(), {
        ...review,
        version: 3,
      });
    }
    record = (await store.submission("owner-a", org, id, sid))[0]!;
    assert.equal(record.status, "approved");
    const notices = (
      await db.query<{ kind: string; user_id: string }>(
        "select kind,user_id from hub_notifications where organization_id=$1",
        [org],
      )
    ).rows;
    assert.equal(
      notices.filter(
        (n) => n.kind === "challenge_approved" && n.user_id === users[0]!.id,
      ).length,
      1,
    );
    assert.ok(
      notices.some(
        (n) => n.kind === "challenge_pending" && n.user_id === "owner-a",
      ),
    );
    assert.ok(!notices.some((n) => n.user_id === "vol-a"));

    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::int as n from hub_points_entries where source='challenge'`,
        )
      ).rows[0]!.n,
      1,
    );
    const entry = String(record.entryId);
    assert.equal(
      result(
        await store.review(
          "owner-a",
          org,
          id,
          sid,
          crypto.randomUUID(),
          review,
        ),
      ).code,
      "conflict",
    );
    assert.equal(
      result(
        await store.submit(users[0]!.id, org, id, crypto.randomUUID(), {
          ...submit,
          version: record.version,
        }),
      ).code,
      "conflict",
    );
    const corrected = await points.save("owner-a", org, {
      key: crypto.randomUUID(),
      kind: "correct",
      people: [people[0]!],
      amount: 5,
      reason: "Corrected verification",
      occurredAt: null,
      activityId: null,
      sessionId: null,
      originalId: entry,
      version: 1,
    });
    assert.equal(
      (corrected[0]!.result as { items: { outcome: string }[] }).items[0]!
        .outcome,
      "saved",
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select sum(amount)::int as n from hub_points_entries where person_id=$1`,
          [people[0]],
        )
      ).rows[0]!.n,
      5,
    );
    assert.equal(
      (
        await db.query<{ source: string }>(
          `select source from hub_points_entries where original_id=$1`,
          [entry],
        )
      ).rows[0]!.source,
      "challenge",
    );
    const second = result(
      await store.save("owner-a", org, null, crypto.randomUUID(), {
        ...create,
        groups: [],
        name: "Second challenge",
      }),
    ).id!;
    await store.save("owner-a", org, second, crypto.randomUUID(), {
      action: "publish",
      version: 1,
    });
    const s2 = result(
      await store.submit(users[0]!.id, org, second, crypto.randomUUID(), {
        ...submit,
        note: "",
      }),
    ).id!;
    await store.submit(users[0]!.id, org, second, crypto.randomUUID(), {
      action: "withdraw",
      version: 1,
    });
    assert.equal(
      (await store.submission("owner-a", org, second, s2))[0]!.status,
      "withdrawn",
    );
    await store.submit(users[0]!.id, org, second, crypto.randomUUID(), {
      ...submit,
      version: 2,
    });
    await store.review("owner-a", org, second, s2, crypto.randomUUID(), {
      action: "reject",
      version: 3,
      feedback: "Please try again",
    });
    assert.equal(
      result(
        await store.review("owner-a", org, second, s2, crypto.randomUUID(), {
          action: "approve",
          version: 3,
          feedback: "",
        }),
      ).code,
      "conflict",
    );
    const direct = {
        action: "record",
        personId: people[2],
        challengeVersion: 2,
        version: null,
        feedback: "Verified together",
      },
      dk = crypto.randomUUID();
    const directId = result(
      await store.review("owner-a", org, second, null, dk, direct),
    ).id!;
    assert(directId);
    assert.equal(
      result(await store.review("owner-a", org, second, null, dk, direct)).id,
      directId,
    );
    assert.equal(
      result(
        await store.review(
          "admin-a",
          org,
          second,
          null,
          crypto.randomUUID(),
          direct,
        ),
      ).code,
      "conflict",
    );
    // Archive preserves pending review while blocking new submissions.
    const b = result(
      await store.submit(users[1]!.id, org, second, crypto.randomUUID(), {
        ...submit,
        note: "",
      }),
    ).id!;
    await store.save("owner-a", org, second, crypto.randomUUID(), {
      action: "archive",
      version: 2,
    });
    assert.equal(
      result(
        await store.submit(users[0]!.id, org, second, crypto.randomUUID(), {
          ...submit,
          version: 4,
        }),
      ).code,
      "challenge_closed",
    );
    await store.review("owner-a", org, second, b, crypto.randomUUID(), {
      action: "approve",
      version: 1,
      feedback: "",
    });
    await assert.rejects(
      db.query(`delete from hub_challenge_events where challenge_id=$1`, [id]),
    );
    await assert.rejects(
      db.query(
        `update hub_challenge_submissions set note='changed',version=version+1 where id=$1`,
        [sid],
      ),
    );
    const call = (
      u: (typeof users)[number],
      path: string,
      method = "GET",
      body?: unknown,
    ) =>
      challengeApi(
        new Request(origin + path, {
          method,
          headers: { "Content-Type": "application/json", Origin: origin },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        u,
        organizations,
        store,
      );
    assert.equal(
      (await call(users[0]!, `/api/organizations/${org}/challenges`))!.status,
      403,
    );
    assert.equal(
      (await call(
        { ...users[0]!, emailVerified: false },
        `/api/organizations/${org}/me/challenges`,
      ))!.status,
      403,
    );
    assert.equal(
      (await call(
        users[0]!,
        `/api/organizations/${org}/me/challenges/${id}/submissions`,
      ))!.status,
      403,
    );
    const response = await call(
      users[0]!,
      `/api/organizations/${org}/me/challenges/${id}`,
    );
    assert.equal(response!.status, 200);
    assert.equal(response!.headers.get("Cache-Control"), "no-store");
    const future = result(
      await store.save("owner-a", org, null, crypto.randomUUID(), {
        ...create,
        name: "Future challenge",
        groups: [],
        startsAt: "2100-01-01T00:00:00Z",
      }),
    ).id!;
    await store.save("owner-a", org, future, crypto.randomUUID(), {
      action: "publish",
      version: 1,
    });
    assert.equal(
      result(
        await store.submit(
          users[1]!.id,
          org,
          future,
          crypto.randomUUID(),
          submit,
        ),
      ).code,
      "challenge_closed",
    );
    const expired = result(
      await store.save("owner-a", org, null, crypto.randomUUID(), {
        ...create,
        name: "Expired challenge",
        endsAt: "2001-01-01T00:00Z",
      }),
    ).id!;
    assert.equal(
      result(
        await store.save("owner-a", org, expired, crypto.randomUUID(), {
          action: "publish",
          version: 1,
        }),
      ).code,
      "challenge_closed",
    );
    const admin = { ...users[0]!, id: "owner-a" };
    const page = await call(
      admin,
      `/api/organizations/${org}/challenges?limit=1`,
    );
    const first = await page!.json();
    assert.equal(first.items.length, 1);
    assert(first.nextCursor);
    const next = await call(
      admin,
      `/api/organizations/${org}/challenges?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`,
    );
    assert.notEqual((await next!.json()).items[0].id, first.items[0].id);
    await assert.rejects(
      db.query(
        `update hub_challenges set points=99,version=version+1 where id=$1`,
        [id],
      ),
    );
    await assert.rejects(
      db.query(`delete from hub_challenge_groups where challenge_id=$1`, [id]),
    );
    const auditChallenge = result(
      await store.save("owner-a", org, null, crypto.randomUUID(), {
        ...create,
        name: "Audit challenge",
        groups: [],
      }),
    ).id!;
    await store.save("owner-a", org, auditChallenge, crypto.randomUUID(), {
      action: "publish",
      version: 1,
    });
    await db.exec(
      `CREATE FUNCTION fail_challenge_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END; $$; CREATE TRIGGER fail_challenge_audit BEFORE INSERT ON hub_challenge_events FOR EACH ROW EXECUTE FUNCTION fail_challenge_audit();`,
    );
    const beforeEntries = (
      await db.query<{ n: number }>(
        `select count(*)::int as n from hub_points_entries`,
      )
    ).rows[0]!.n;

    await assert.rejects(
      store.review("owner-a", org, auditChallenge, null, crypto.randomUUID(), {
        ...direct,
        personId: people[2],
      }),
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::int as n from hub_challenge_submissions where challenge_id=$1`,
          [auditChallenge],
        )
      ).rows[0]!.n,
      0,
    );
    // A new challenge creation also rolls back if audit persistence fails.
    await assert.rejects(
      store.save("owner-a", org, null, crypto.randomUUID(), {
        ...create,
        name: "Rollback fixture",
      }),
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::int as n from hub_challenges where name='Rollback fixture'`,
        )
      ).rows[0]!.n,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::int as n from hub_points_entries`,
        )
      ).rows[0]!.n,
      beforeEntries,
    );
    await db.exec(
      `DROP TRIGGER fail_challenge_audit ON hub_challenge_events;DROP FUNCTION fail_challenge_audit();`,
    );
    const link = (await participants.account("owner-a", org, people[0]!))[0]!
      .link as { id: string };
    await participants.revoke(
      "owner-a",
      org,
      people[0]!,
      link.id,
      "link",
      "Withdrawn access",
    );
    assert.equal(
      result(await store.submit(users[0]!.id, org, id, sk, submit)).code,
      "forbidden",
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role) values($1,$2,'admin')`,
      [org, users[0]!.id],
    );
    assert.equal(
      result(
        await store.review(
          users[0]!.id,
          org,
          id,
          sid,
          crypto.randomUUID(),
          review,
        ),
      ).code,
      "forbidden",
    );
  } finally {
    await db.close();
  }
});
