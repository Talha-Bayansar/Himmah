import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createParticipantStore } from "../src/server/participant-store.ts";
import { createStore } from "../src/server/store.ts";
import { createPointsStore } from "../src/server/points-store.ts";
import { createRewardStore } from "../src/server/reward-store.ts";
import { createCommunityStore } from "../src/server/community-store.ts";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAccessStore } from "../src/server/access-store.ts";
import { activityApi } from "../src/server/activity-api.ts";
import { accessApi } from "../src/server/access-api.ts";
import { participantApi } from "../src/server/participant-api.ts";
import { pageInput, newToken, tokenHash } from "../src/community/contracts.ts";
import { participantInvitationInput } from "../src/participants/contracts.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
test("participant invitation requires a valid email, consent and a bounded request key", () => {
  assert.throws(() =>
    participantInvitationInput({
      email: "a@example.invalid",
      key: crypto.randomUUID(),
      consent: false,
    }),
  );
  assert.throws(() =>
    participantInvitationInput({
      email: "bad",
      key: crypto.randomUUID(),
      consent: true,
    }),
  );
  assert.equal(
    participantInvitationInput({
      email: " CHILD@EXAMPLE.INVALID ",
      key: crypto.randomUUID(),
      consent: true,
    }).email,
    "child@example.invalid",
  );
});
test("PostgreSQL participant linking: verified email, private self data, role separation, revocation, archival and historical self-approval protection", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../db/migrations/generated/", import.meta.url),
      journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", dir), "utf8"),
      );
    for (const entry of journal.entries)
      await db.exec(await readFile(new URL(entry.tag + ".sql", dir), "utf8"));
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Test A','test-a','UTC','owner-a',$3),($2,'Test B','test-b','UTC','owner-b',$4)`,
      [org, other, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role,display_name) values($1,'owner-a','owner','Organizer A'),($1,'vol-a','volunteer','Volunteer A'),($2,'owner-b','owner','Organizer B')`,
      [org, other],
    );
    const pa = crypto.randomUUID(),
      pb = crypto.randomUUID(),
      pc = crypto.randomUUID(),
      foreign = crypto.randomUUID();
    for (const [id, tenant, name] of [
      [pa, org, "My nickname"],
      [pb, org, "Private peer"],
      [pc, org, "Other member"],
      [foreign, other, "Foreign private member"],
    ])
      await db.query(
        `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,$3,'owner-a',$4,'owner-a')`,
        [id, tenant, name, crypto.randomUUID()],
      );
    const dialect = new PgDialect(),
      execute = async (st: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query(q.sql, q.params)).rows as Record<
          string,
          unknown
        >[];
      };
    const store = createParticipantStore(
        "postgresql://test:test@localhost/test",
        execute,
      ),
      organizations = createStore(
        "postgresql://test:test@localhost/test",
        execute,
      ),
      points = createPointsStore(
        "postgresql://test:test@localhost/test",
        execute,
      ),
      rewards = createRewardStore(
        "postgresql://test:test@localhost/test",
        execute,
      ),
      community = createCommunityStore(
        "postgresql://test:test@localhost/test",
        execute,
      );
    const page = pageInput(
      new URL("https://test.invalid?limit=1"),
      org + "/me",
    );
    const child = {
      id: "child-a",
      name: "Account nickname",
      email: "child@example.invalid",
      emailVerified: true,
    };
    const result = (rows: Record<string, unknown>[]) =>
      rows[0]!.result as {
        code?: string;
        id?: string;
        organizationId?: string;
      };
    // Expiry, explicit revocation and loss of creator authority invalidate both preview and acceptance.
    for (const scenario of ["expired", "revoked", "creator_demoted"]) {
      const person = crypto.randomUUID(),
        creator = scenario === "creator_demoted" ? "temp-admin" : "owner-a";
      if (creator === "temp-admin")
        await db.query(
          `insert into hub_memberships(organization_id,user_id,role) values($1,$2,'admin')`,
          [org, creator],
        );
      await db.query(
        `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,'Temporary nickname','owner-a',$3,'owner-a')`,
        [person, org, crypto.randomUUID()],
      );
      const invalidHash = await tokenHash(newToken()),
        inv = result(
          await store.invite(
            creator,
            org,
            person,
            crypto.randomUUID(),
            child.email,
            invalidHash,
            true,
          ),
        );
      assert.ok(inv.id);
      if (scenario === "expired")
        await db.query(
          `update hub_participant_invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 second' where id=$1`,
          [inv.id],
        );
      if (scenario === "revoked") {
        await store.revoke("owner-a", org, person, inv.id!, "invitation", null);
        await store.revoke("owner-a", org, person, inv.id!, "invitation", null);
        assert.equal(
          (await store.events("owner-a", org, person, page)).filter(
            (e) => e.action === "revoke_invitation",
          ).length,
          1,
        );
      }
      if (scenario === "creator_demoted")
        await db.query(
          `update hub_memberships set role='volunteer' where organization_id=$1 and user_id=$2`,
          [org, creator],
        );
      assert.equal((await store.preview(child, invalidHash)).length, 0);
      assert.equal(
        result(await store.accept(child, invalidHash)).code,
        "invalid_invitation",
      );
    }
    const key = crypto.randomUUID(),
      token = newToken(),
      hash = await tokenHash(token);
    assert.equal(
      result(await store.invite("vol-a", org, pa, key, child.email, hash, true))
        .code,
      "forbidden",
    );
    assert.equal(
      result(
        await store.invite(
          "owner-a",
          org,
          foreign,
          key,
          child.email,
          hash,
          true,
        ),
      ).code,
      "not_found",
    );
    assert.equal(
      result(
        await store.invite("owner-a", org, pa, key, child.email, hash, false),
      ).code,
      "participant_consent",
    );
    const invited = result(
      await store.invite("owner-a", org, pa, key, child.email, hash, true),
    );
    assert.ok(invited.id);
    assert.equal(
      result(
        await store.invite("owner-a", org, pa, key, child.email, hash, true),
      ).id,
      invited.id,
    );
    assert.equal(
      result(
        await store.invite(
          "owner-a",
          org,
          pa,
          key,
          "changed@example.invalid",
          hash,
          true,
        ),
      ).code,
      "conflict",
    );
    assert.equal(
      result(
        await store.invite(
          "owner-a",
          org,
          pa,
          crypto.randomUUID(),
          child.email,
          await tokenHash(newToken()),
          true,
        ),
      ).code,
      "participant_pending",
    );
    assert.equal(
      (await store.preview({ ...child, email: "wrong@example.invalid" }, hash))
        .length,
      0,
    );
    assert.equal(
      result(
        await store.accept({ ...child, email: "wrong@example.invalid" }, hash),
      ).code,
      "invalid_invitation",
    );
    const req = (path: string, method = "GET", body?: unknown) =>
      new Request("https://test.invalid" + path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal(
      (await participantApi(
        req("/api/participant-invitations/accept", "POST", { token }),
        { ...child, emailVerified: false },
        organizations,
        store,
      ))!.status,
      403,
    );
    const accepted = await participantApi(
      req("/api/participant-invitations/accept", "POST", {
        token,
        userId: "attacker",
      }),
      child,
      organizations,
      store,
    );
    assert.equal(accepted!.status, 200);
    assert.equal(result(await store.accept(child, hash)).organizationId, org);
    assert.equal((await organizations.get(child.id, org))!.role, "participant");
    assert.equal((await organizations.list(child.id, page)).length, 1);
    assert.equal(
      (await activityApi(
        new Request(`https://test.invalid/api/organizations/${org}/activities`),
        child,
        organizations,
        createActivityStore("postgresql://test:test@localhost/test", execute),
      ))!.status,
      403,
    );
    for (const suffix of ["access/me", "work/members"])
      assert.equal(
        (await accessApi(
          new Request(
            `https://test.invalid/api/organizations/${org}/${suffix}`,
          ),
          child,
          organizations,
          createAccessStore("postgresql://test:test@localhost/test", execute),
        ))!.status,
        403,
      );

    assert.equal(await organizations.get(child.id, other), null);
    assert.equal((await store.summary("different-user", org)).length, 0);
    await points.save("owner-a", org, {
      key: crypto.randomUUID(),
      kind: "award",
      people: [pa, pb],
      amount: 20,
      reason: "Staff-only note naming Private peer",
      occurredAt: "2020-01-01T12:00Z",
      activityId: null,
      sessionId: null,
      originalId: null,
      version: null,
    });
    const ownPoints = await store.points(child.id, org, page);
    assert.equal(ownPoints.length, 1);
    assert.equal(ownPoints[0]!.amount, 20);
    assert.equal("reason" in ownPoints[0]!, false);
    assert.equal("actorName" in ownPoints[0]!, false);
    assert.equal("personId" in ownPoints[0]!, false);
    const reward = result(
      await rewards.save("owner-a", org, null, crypto.randomUUID(), {
        name: "Drink token",
        description: "A drink",
        cost: 5,
        stock: 2,
      }),
    );
    const reserve = result(
      await rewards.redeem(
        "owner-a",
        org,
        reward.id!,
        null,
        crypto.randomUUID(),
        { personId: pa, rewardVersion: 1 },
      ),
    );
    await rewards.redeem(
      "owner-a",
      org,
      reward.id!,
      null,
      crypto.randomUUID(),
      { personId: pb, rewardVersion: 1 },
    );
    const ownHistory = await store.redemptions(child.id, org, page);
    assert.equal(ownHistory.length, 1);
    assert.equal("personName" in ownHistory[0]!, false);
    assert.equal("createdByName" in ownHistory[0]!, false);
    assert.equal("cancelReason" in ownHistory[0]!, false);
    const wallet = (await store.summary(child.id, org))[0]!;
    assert.deepEqual(
      [wallet.name, wallet.earned, wallet.reserved, wallet.available],
      ["My nickname", "20", "5", "15"],
    );
    assert.equal(
      (await store.rewards(child.id, org, page))[0]!.eligible,
      false,
    );
    assert.equal((await store.rewards(child.id, other, page)).length, 0);
    assert.equal(
      (await participantApi(
        req("/api/organizations/" + org + "/participants/" + pb),
        child,
        organizations,
        store,
      ))!.status,
      403,
    );
    assert.equal(
      (await participantApi(
        req("/api/organizations/" + org + "/me/points", "POST", {
          amount: 1000,
        }),
        child,
        organizations,
        store,
      ))!.status,
      403,
    );
    const personal = await participantApi(
      req("/api/organizations/" + org + "/me/points?person=" + pb),
      child,
      organizations,
      store,
    );
    assert.equal(personal!.headers.get("Cache-Control"), "no-store");
    assert.equal((await personal!.text()).includes("Staff-only"), false);
    await assert.rejects(() =>
      db.query(
        `insert into hub_memberships(organization_id,user_id,role) values($1,'child-a','admin')`,
        [org],
      ),
    );
    const staffToken = await tokenHash(newToken());
    await community.invite(
      "owner-a",
      org,
      child.email,
      "volunteer",
      crypto.randomUUID(),
      staffToken,
    );
    assert.equal((await community.preview(child, staffToken)).length, 0);
    assert.equal((await community.accept(child, staffToken)).length, 0);
    const extraHash = await tokenHash(newToken());
    await store.invite(
      "owner-a",
      org,
      pb,
      crypto.randomUUID(),
      child.email,
      extraHash,
      true,
    );
    assert.equal(
      result(await store.accept(child, extraHash)).code,
      "participant_linked",
    );
    const staffHash = await tokenHash(newToken());
    await store.invite(
      "owner-a",
      org,
      pc,
      crypto.randomUUID(),
      "owner@example.invalid",
      staffHash,
      true,
    );
    assert.equal(
      result(
        await store.accept(
          { id: "owner-a", name: "Owner", email: "owner@example.invalid" },
          staffHash,
        ),
      ).code,
      "participant_staff_conflict",
    );
    const account = (await store.account("owner-a", org, pa))[0]!;
    const link = account.link as { id: string };
    assert.equal(
      result(
        await store.revoke(
          "owner-a",
          org,
          pa,
          link.id,
          "link",
          "Consent withdrawn",
        ),
      ).id,
      link.id,
    );
    await store.revoke("owner-a", org, pa, link.id, "link", "Retry");
    assert.equal((await store.summary(child.id, org)).length, 0);
    assert.equal(await organizations.get(child.id, org), null);
    assert.equal(
      result(await store.accept(child, hash)).code,
      "invalid_invitation",
    );
    assert.equal(
      (await participantApi(
        req("/api/organizations/" + org + "/me"),
        child,
        organizations,
        store,
      ))!.status,
      404,
    );
    assert.equal((await points.member("owner-a", org, pa))[0]!.balance, "20");
    assert.equal((await rewards.wallet("owner-a", org, pa))[0]!.reserved, "5");
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role,display_name) values($1,'child-a','admin','Former participant')`,
      [org],
    );
    const selfAward = {
      key: crypto.randomUUID(),
      kind: "award" as const,
      people: [pa],
      amount: 1,
      reason: "Must not self approve",
      occurredAt: "2020-01-01T12:00Z",
      activityId: null,
      sessionId: null,
      originalId: null,
      version: null,
    };
    assert.equal(
      result(await points.save(child.id, org, selfAward)).code,
      "forbidden",
    );
    assert.equal((await points.member(child.id, org, pa))[0]!.canAward, false);
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          `select hub_can_attend_person($1,$2,$3,$4,$5) as allowed`,
          [child.id, org, crypto.randomUUID(), crypto.randomUUID(), pa],
        )
      ).rows[0]!.allowed,
      false,
    );
    assert.equal(
      result(
        await rewards.redeem(child.id, org, reward.id!, reserve.id!, null, {
          action: "fulfilled",
          version: 1,
        }),
      ).code,
      "forbidden",
    );
    const activity = crypto.randomUUID(),
      session = crypto.randomUUID();
    await db.query(
      `insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key) values($1,$2,'Gathering','','','UTC','owner-a',$3)`,
      [activity, org, crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key) values($1,$2,$3,'Gathering','','','UTC','2020-01-01T10:00Z','2020-01-01T11:00Z','owner-a',$4)`,
      [session, org, activity, crypto.randomUUID()],
    );
    const attendance = createAttendanceStore(
      "postgresql://test:test@localhost/test",
      execute,
    );
    assert.equal(
      result(
        await attendance.save(child.id, org, activity, session, {
          key: crypto.randomUUID(),
          status: "present",
          reason: "",
          items: [{ personId: pa, version: 0 }],
        }),
      ).code,
      "forbidden",
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::int as n from hub_attendance where organization_id=$1 and person_id=$2`,
          [org, pa],
        )
      ).rows[0]!.n,
      0,
    );
    const token2 = await tokenHash(newToken());
    const newInvite = result(
      await store.invite(
        "owner-a",
        org,
        pa,
        crypto.randomUUID(),
        "second@example.invalid",
        token2,
        true,
      ),
    );
    assert.ok(newInvite.id);
    assert.equal(
      result(
        await store.accept(
          {
            id: "child-b",
            name: "New account",
            email: "second@example.invalid",
          },
          token2,
        ),
      ).organizationId,
      org,
    );
    await db.query(
      `update hub_people set archived=true where organization_id=$1 and id=$2`,
      [org, pa],
    );
    assert.equal((await store.summary("child-b", org)).length, 0);
    await db.query(
      `update hub_people set archived=false where organization_id=$1 and id=$2`,
      [org, pa],
    );
    assert.equal((await store.summary("child-b", org)).length, 0);
    assert.equal(
      result(
        await store.accept(
          {
            id: "child-b",
            name: "New account",
            email: "second@example.invalid",
          },
          token2,
        ),
      ).code,
      "invalid_invitation",
    );
    const events = await store.events("owner-a", org, pa, {
      ...page,
      limit: 50,
    });
    assert.equal(events.filter((e) => e.action === "revoke_link").length, 1);
    assert.equal(
      events.filter((e) => e.action === "member_archived").length,
      1,
    );
    await assert.rejects(() =>
      db.query(`update hub_participant_links set user_id='other' where id=$1`, [
        link.id,
      ]),
    );
    await assert.rejects(() =>
      db.query(`delete from hub_participant_events where organization_id=$1`, [
        org,
      ]),
    );
  } finally {
    await db.close();
  }
});
