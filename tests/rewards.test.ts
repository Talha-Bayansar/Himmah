import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createRewardStore } from "../src/server/reward-store.ts";
import { createPointsStore } from "../src/server/points-store.ts";
import { rewardInput } from "../src/rewards/contracts.ts";
import { rewardApi } from "../src/server/reward-api.ts";
import { pageInput, pageResult } from "../src/community/contracts.ts";
import type { OrganizationStore } from "../src/server/store.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
test("reward input requires a valid name, whole positive cost and bounded optional stock", () => {
  const valid = {
    name: "Book token",
    description: "A useful book",
    cost: 10,
    stock: null,
  };
  assert.deepEqual(rewardInput(valid), valid);
  for (const patch of [
    { name: "x" },
    { description: "x".repeat(1001) },
    { cost: 0 },
    { cost: 1.1 },
    { cost: "10" },
    { cost: 1000001 },
    { stock: -1 },
    { stock: 0.5 },
    { stock: "1" },
    { stock: undefined },
  ])
    assert.throws(() => rewardInput({ ...valid, ...patch }));
  assert.equal(rewardInput({ ...valid, stock: 0 }).stock, 0);
});
test("PostgreSQL rewards preserve earned points, reserve atomically, protect stock and keep audited final history", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../db/migrations/generated/", import.meta.url),
      journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", dir), "utf8"),
      );
    for (const m of journal.entries)
      await db.exec(await readFile(new URL(m.tag + ".sql", dir), "utf8"));
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Test A','test-a','UTC','owner-a',$3),($2,'Test B','test-b','UTC','owner-b',$4)`,
      [org, other, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role,display_name) values($1,'owner-a','owner','Owner A'),($1,'admin-a','admin','Admin A'),($1,'vol-a','volunteer','Volunteer A'),($2,'owner-b','owner','Owner B')`,
      [org, other],
    );
    const pa = crypto.randomUUID(),
      pb = crypto.randomUUID(),
      pc = crypto.randomUUID(),
      foreign = crypto.randomUUID();
    for (const [id, tenant, archived] of [
      [pa, org, false],
      [pb, org, false],
      [pc, org, true],
      [foreign, other, false],
    ] as const)
      await db.query(
        `insert into hub_people(id,organization_id,name,archived,created_by,creation_key,consent_recorded_by,created_at) values($1,$2,$3,$4,'owner-a',$5,'owner-a','2020-01-01')`,
        [
          id,
          tenant,
          id === pa ? "Member A" : "Member B",
          archived,
          crypto.randomUUID(),
        ],
      );
    const dialect = new PgDialect(),
      execute = async (st: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query(q.sql, q.params)).rows as Record<
          string,
          unknown
        >[];
      },
      store = createRewardStore(
        "postgresql://test:test@localhost/test",
        execute,
      ),
      points = createPointsStore(
        "postgresql://test:test@localhost/test",
        execute,
      );
    type Result = { id?: string; code?: string };
    const result = (rows: Record<string, unknown>[]) =>
      rows[0]!.result as Result;
    const create = async (
      cost: number,
      stock: number | null,
      name = "Book token",
    ) =>
      result(
        await store.save("owner-a", org, null, crypto.randomUUID(), {
          name,
          description: "A useful book",
          cost,
          stock,
        }),
      );
    const award = (who: string, amount: number) =>
      points.save("owner-a", org, {
        key: crypto.randomUUID(),
        kind: "award",
        people: [who],
        amount,
        reason: "Helping at an event",
        occurredAt: "2020-01-01T12:00Z",
        activityId: null,
        sessionId: null,
        originalId: null,
        version: null,
      });
    await award(pa, 100);
    await award(pb, 100);
    const page = pageInput(
      new URL("https://test.invalid?limit=1"),
      org + "/rewards",
    );
    const reward = await create(60, 1);
    assert.ok(reward.id);
    const id = reward.id!;
    assert.equal(
      result(
        await store.save("vol-a", org, null, crypto.randomUUID(), {
          name: "Bad grant",
          description: "",
          cost: 1,
          stock: null,
        }),
      ).code,
      "forbidden",
    );
    assert.equal((await store.get("owner-b", org, id)).length, 0);
    assert.equal((await store.get("vol-a", org, id)).length, 0);
    const body = { personId: pa, rewardVersion: 1 },
      key = crypto.randomUUID();
    assert.equal(
      result(
        await store.redeem("owner-a", org, id, null, crypto.randomUUID(), {
          ...body,
          personId: foreign,
        }),
      ).code,
      "not_found",
    );
    assert.equal(
      result(
        await store.redeem("owner-a", org, id, null, crypto.randomUUID(), {
          ...body,
          personId: pc,
        }),
      ).code,
      "reward_member_archived",
    );
    const simultaneous = await Promise.all([
      store.redeem("owner-a", org, id, null, key, body),
      store.redeem("admin-a", org, id, null, crypto.randomUUID(), {
        personId: pb,
        rewardVersion: 1,
      }),
    ]);
    assert.equal(result(simultaneous[1]!).code, "reward_out_of_stock");
    const reservation = result(simultaneous[0]!);
    assert.ok(reservation.id);
    assert.equal(
      result(await store.redeem("owner-a", org, id, null, key, body)).id,
      reservation.id,
    );
    assert.equal(
      result(
        await store.redeem("owner-a", org, id, null, key, {
          personId: pb,
          rewardVersion: 1,
        }),
      ).code,
      "conflict",
    );
    assert.equal(
      result(await store.redeem("admin-a", org, id, null, key, body)).code,
      "conflict",
    );
    let wallet = (await store.wallet("owner-a", org, pa))[0]!;
    assert.deepEqual(
      [wallet.earned, wallet.reserved, wallet.spent, wallet.available],
      ["100", "60", "0", "40"],
    );
    assert.equal((await points.member("owner-a", org, pa))[0]!.balance, "100");
    const second = await create(50, null, "Another reward");
    assert.equal(
      result(
        await store.redeem(
          "owner-a",
          org,
          second.id!,
          null,
          crypto.randomUUID(),
          body,
        ),
      ).code,
      "reward_balance",
    );
    assert.equal(
      result(
        await store.save("owner-a", org, id, null, {
          action: "edit",
          version: 1,
          name: "Updated token",
          description: "Edited",
          cost: 70,
          stock: 0,
        }),
      ).code,
      "reward_stock_used",
    );
    assert.equal(
      result(
        await store.save("owner-a", org, id, null, {
          action: "edit",
          version: 1,
          name: "Updated token",
          description: "Edited",
          cost: 70,
          stock: 2,
        }),
      ).id,
      id,
    );
    assert.equal(
      result(
        await store.redeem("owner-a", org, id, null, crypto.randomUUID(), {
          personId: pb,
          rewardVersion: 1,
        }),
      ).code,
      "conflict",
    );
    assert.equal(
      (await store.redemption("owner-a", org, id, reservation.id!))[0]!.cost,
      60,
    );
    assert.equal(
      (await store.redemption("owner-a", org, id, reservation.id!))[0]!
        .rewardName,
      "Book token",
    );
    assert.equal(
      result(
        await store.redeem("owner-a", org, id, reservation.id!, null, {
          action: "cancelled",
          version: 1,
          reason: "",
        }),
      ).code,
      "reward_reason",
    );
    assert.equal(
      result(
        await store.redeem("owner-a", org, id, reservation.id!, null, {
          action: "cancelled",
          version: 1,
          reason: "Member chose a different reward",
        }),
      ).id,
      reservation.id,
    );
    assert.equal(
      result(
        await store.redeem("owner-a", org, id, reservation.id!, null, {
          action: "cancelled",
          version: 1,
          reason: "Retry",
        }),
      ).id,
      reservation.id,
    );
    wallet = (await store.wallet("owner-a", org, pa))[0]!;
    assert.equal(wallet.available, "100");
    assert.equal((await store.get("owner-a", org, id))[0]!.used, 0);
    assert.equal(
      result(
        await store.redeem("owner-a", org, id, reservation.id!, null, {
          action: "fulfilled",
          version: 1,
        }),
      ).code,
      "conflict",
    );
    const handed = result(
      await store.redeem("owner-a", org, id, null, crypto.randomUUID(), {
        personId: pa,
        rewardVersion: 2,
      }),
    );
    await store.redeem("owner-a", org, id, handed.id!, null, {
      action: "fulfilled",
      version: 1,
    });
    await store.redeem("owner-a", org, id, handed.id!, null, {
      action: "fulfilled",
      version: 1,
    });
    wallet = (await store.wallet("owner-a", org, pa))[0]!;
    assert.deepEqual(
      [wallet.earned, wallet.reserved, wallet.spent, wallet.available],
      ["100", "0", "70", "30"],
    );
    assert.equal(
      result(
        await store.redeem("owner-a", org, id, handed.id!, null, {
          action: "cancelled",
          version: 2,
          reason: "Cannot return a handout",
        }),
      ).code,
      "conflict",
    );
    const original = (await points.history("owner-a", org, pa, page))[0]!;
    await points.save("owner-a", org, {
      key: crypto.randomUUID(),
      kind: "correct",
      people: [pa],
      amount: 10,
      reason: "Corrected contribution",
      occurredAt: "2020-01-01T12:00Z",
      activityId: null,
      sessionId: null,
      originalId: original.id as string,
      version: 1,
    });
    wallet = (await store.wallet("owner-a", org, pa))[0]!;
    assert.equal(wallet.earned, "10");
    assert.equal(wallet.available, "-60");
    assert.equal(wallet.spent, "70");
    assert.equal(
      result(
        await store.redeem(
          "owner-a",
          org,
          second.id!,
          null,
          crypto.randomUUID(),
          body,
        ),
      ).code,
      "reward_balance",
    );
    assert.equal(
      (await store.members("owner-a", org, id, page, true)).some(
        (p) => p.id === pa,
      ),
      false,
    );
    assert.equal(
      (await store.members("owner-a", org, id, page, false)).some(
        (p) => p.available === "-60",
      ),
      true,
    );
    await store.save("owner-a", org, id, null, {
      action: "archive",
      version: 2,
      archived: true,
    });
    assert.equal(
      result(
        await store.redeem("owner-a", org, id, null, crypto.randomUUID(), {
          personId: pb,
          rewardVersion: 3,
        }),
      ).code,
      "reward_archived",
    );
    assert.equal(
      (await store.redemptions("owner-a", org, id, page, "fulfilled")).length,
      1,
    );
    assert.equal(
      (await store.redemptions("owner-a", org, id, page, "cancelled"))[0]!
        .cancelReason,
      "Member chose a different reward",
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          `select count(*)::int as count from hub_reward_changes where redemption_id=$1`,
          [reservation.id],
        )
      ).rows[0]!.count,
      2,
    );
    await assert.rejects(() =>
      db.query(`update hub_redemptions set cost=1 where id=$1`, [handed.id]),
    );
    await assert.rejects(() =>
      db.query(`delete from hub_reward_changes where reward_id=$1`, [id]),
    );
    const third = await create(60, null, "Third reward");
    const crossReward = await Promise.all([
      store.redeem("owner-a", org, second.id!, null, crypto.randomUUID(), {
        personId: pb,
        rewardVersion: 1,
      }),
      store.redeem("owner-a", org, third.id!, null, crypto.randomUUID(), {
        personId: pb,
        rewardVersion: 1,
      }),
    ]);
    assert.ok(result(crossReward[0]!).id);
    assert.equal(result(crossReward[1]!).code, "reward_balance");
    assert.equal((await store.wallet("owner-a", org, pb))[0]!.available, "50");
    const rollback = await create(10, 1, "Rollback reward");
    await db.exec(
      `create function fail_reward_audit() returns trigger language plpgsql as $$ begin if NEW.action='redeem' and NEW.after->>'reward_name'='Rollback reward' then raise exception 'injected audit failure'; end if; return NEW; end; $$; create trigger fail_reward_audit before insert on hub_reward_changes for each row execute function fail_reward_audit();`,
    );
    await assert.rejects(() =>
      store.redeem("owner-a", org, rollback.id!, null, crypto.randomUUID(), {
        personId: pb,
        rewardVersion: 1,
      }),
    );
    assert.equal((await store.get("owner-a", org, rollback.id!))[0]!.used, 0);
    assert.equal((await store.wallet("owner-a", org, pb))[0]!.available, "50");
    const firstPage = pageResult(
      (await store.list("owner-a", org, page)) as {
        id: string;
        createdAt: string;
      }[],
      page,
    );
    assert.equal(firstPage.items.length, 1);
    assert.ok(firstPage.nextCursor);
    const following = pageInput(
      new URL(
        "https://test.invalid?limit=1&cursor=" +
          encodeURIComponent(firstPage.nextCursor!),
      ),
      org + "/rewards",
    );
    const nextPage = pageResult(
      (await store.list("owner-a", org, following)) as {
        id: string;
        createdAt: string;
      }[],
      following,
    );
    assert.notEqual(nextPage.items[0]!.id, firstPage.items[0]!.id);
    assert.throws(() =>
      pageInput(
        new URL(
          "https://test.invalid?limit=1&cursor=" +
            encodeURIComponent(firstPage.nextCursor!),
        ),
        other + "/rewards",
      ),
    );

    const orgs = {
      get: async (user: string, id: string) =>
        id === org
          ? {
              id,
              role: user === "vol-a" ? "volunteer" : "owner",
              timezone: "UTC",
            }
          : null,
    } as unknown as OrganizationStore;
    const request = (suffix: string, method = "GET", body?: unknown) =>
      new Request("https://test.invalid/api/organizations/" + org + suffix, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal(
      (await rewardApi(
        request("/rewards"),
        { id: "vol-a", emailVerified: true },
        orgs,
        store,
      ))!.status,
      403,
    );
    assert.equal(
      (await rewardApi(
        request("/rewards"),
        { id: "owner-a", emailVerified: false },
        orgs,
        store,
      ))!.status,
      403,
    );
    assert.equal(
      (await rewardApi(
        request("/rewards/" + id + "/redemptions"),
        { id: "owner-a", emailVerified: true },
        orgs,
        store,
      ))!.headers.get("Cache-Control"),
      "no-store",
    );
    assert.equal(
      (await rewardApi(
        request("/reward-wallet/" + foreign),
        { id: "owner-a", emailVerified: true },
        orgs,
        store,
      ))!.status,
      404,
    );
    assert.equal(
      (await rewardApi(
        request("/rewards/" + id + "/redemptions", "POST", {
          key: crypto.randomUUID(),
          personId: pb,
          rewardVersion: 3,
        }),
        { id: "owner-a", emailVerified: true },
        orgs,
        store,
      ))!.status,
      409,
    );
    await db.query(
      `update hub_memberships set role='volunteer' where organization_id=$1 and user_id='admin-a'`,
      [org],
    );
    assert.equal(
      result(await store.redeem("admin-a", org, id, null, key, body)).code,
      "forbidden",
    );
  } finally {
    await db.close();
  }
});
