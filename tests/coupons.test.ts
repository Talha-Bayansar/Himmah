import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createCouponStore } from "../src/server/coupon-store.ts";
import { createParticipantStore } from "../src/server/participant-store.ts";
import { createRewardStore } from "../src/server/reward-store.ts";
import { createPointsStore } from "../src/server/points-store.ts";
import { createStore } from "../src/server/store.ts";
import { couponApi } from "../src/server/coupon-api.ts";
import { createHandler, type Env } from "../src/server/worker.ts";
import { newToken, tokenHash, pageInput } from "../src/community/contracts.ts";
import { couponCode } from "../src/coupons/contracts.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  origin = "https://test.invalid";
test("collection input accepts only a code or a same-app, same-organization coupon fragment", () => {
  const code = "a".repeat(64);
  assert.equal(couponCode(code, org, origin), code);
  assert.equal(
    couponCode(`${origin}/workspace/${org}/collect#${code}`, org, origin),
    code,
  );
  for (const value of [
    "short",
    `${origin}/workspace/${other}/collect#${code}`,
    `https://evil.invalid/workspace/${org}/collect#${code}`,
    `${origin}/workspace/${org}/collect?code=${code}`,
    `${origin}/workspace/${org}/members#${code}`,
  ])
    assert.throws(() => couponCode(value, org, origin));
});
test("the generated local QR SVG decodes to the private collection fragment", async () => {
  const [
    { createElement },
    { renderToStaticMarkup },
    { QRCodeSVG },
    { default: sharp },
    zxing,
  ] = await Promise.all([
    import("react"),
    import("react-dom/server"),
    import("qrcode.react"),
    import("sharp"),
    import("@zxing/library"),
  ]);
  const value = `https://himmah-hub.talha-bayansar.workers.dev/workspace/${org}/collect#${"a".repeat(64)}`;
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, { value, size: 240, marginSize: 4, level: "M" }),
  );
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(info.width * info.height);
  for (let i = 0; i < pixels.length; i++)
    pixels[i] = (data[i * 4]! + 2 * data[i * 4 + 1]! + data[i * 4 + 2]!) / 4;
  const result = new zxing.QRCodeReader().decode(
    new zxing.BinaryBitmap(
      new zxing.HybridBinarizer(
        new zxing.RGBLuminanceSource(pixels, info.width, info.height),
      ),
    ),
  );
  assert.equal(result.getText(), value);
  assert.equal(new URL(result.getText()).search, "");
});
test("PostgreSQL coupons: backfill, concurrent stock/wallet claims, receipts, private access, cancellation versus collection, finality and historical self-collection denial", async () => {
  const db = new PGlite();
  try {
    const directory = new URL("../db/migrations/generated/", import.meta.url),
      journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", directory), "utf8"),
      );
    for (const entry of journal.entries.slice(0, -1))
      await db.exec(
        await readFile(new URL(entry.tag + ".sql", directory), "utf8"),
      );
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Test A','test-a','UTC','owner-a',$3),($2,'Test B','test-b','UTC','owner-b',$4)`,
      [org, other, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role,display_name) values($1,'owner-a','owner','Organizer'),($1,'vol-a','volunteer','Volunteer'),($2,'owner-b','owner','Other organizer')`,
      [org, other],
    );
    const pa = crypto.randomUUID(),
      pb = crypto.randomUUID();
    for (const [id, name] of [
      [pa, "Member A"],
      [pb, "Member B"],
    ])
      await db.query(
        `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,$3,'owner-a',$4,'owner-a')`,
        [id, org, name, crypto.randomUUID()],
      );
    const dialect = new PgDialect(),
      execute = async (st: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query(q.sql, q.params)).rows as Record<
          string,
          unknown
        >[];
      },
      url = "postgresql://test:test@localhost/test";
    const participants = createParticipantStore(url, execute),
      rewards = createRewardStore(url, execute),
      points = createPointsStore(url, execute),
      store = createCouponStore(url, execute),
      organizations = createStore(url, execute);
    const result = (rows: Record<string, unknown>[]) =>
      rows[0]!.result as { id?: string; code?: string };
    const users = [
      {
        id: "child-a",
        name: "Nickname A",
        email: "a@example.invalid",
        emailVerified: true,
      },
      {
        id: "child-b",
        name: "Nickname B",
        email: "b@example.invalid",
        emailVerified: true,
      },
    ];
    for (const [i, id] of [pa, pb].entries()) {
      const hash = await tokenHash(newToken());
      await participants.invite(
        "owner-a",
        org,
        id,
        crypto.randomUUID(),
        users[i]!.email,
        hash,
        true,
      );
      await participants.accept(users[i]!, hash);
    }
    await points.save("owner-a", org, {
      key: crypto.randomUUID(),
      kind: "award",
      people: [pa, pb],
      amount: 100,
      reason: "Private staff note",
      occurredAt: "2020-01-01T00:00Z",
      activityId: null,
      sessionId: null,
      originalId: null,
      version: null,
    });
    const reward = async (
      name: string,
      cost: number,
      stock: number | null = null,
    ) =>
      result(
        await rewards.save("owner-a", org, null, crypto.randomUUID(), {
          name,
          description: "A reward",
          cost,
          stock,
        }),
      ).id!;
    const legacyReward = await reward("Existing reward", 5),
      legacy = result(
        await rewards.redeem(
          "owner-a",
          org,
          legacyReward,
          null,
          crypto.randomUUID(),
          { personId: pa, rewardVersion: 1 },
        ),
      ).id!,
      legacyUsed = result(
        await rewards.redeem(
          "owner-a",
          org,
          legacyReward,
          null,
          crypto.randomUUID(),
          { personId: pa, rewardVersion: 1 },
        ),
      ).id!;
    await rewards.redeem("owner-a", org, legacyReward, legacyUsed, null, {
      action: "fulfilled",
      version: 1,
    });
    await db.exec(
      await readFile(
        new URL(journal.entries.at(-1).tag + ".sql", directory),
        "utf8",
      ),
    );
    assert.match(
      String((await store.get("child-a", org, legacy))[0]!.code),
      /^[0-9a-f]{64}$/,
    );
    assert.equal((await store.get("child-a", org, legacyUsed))[0]!.code, null);
    const changed = await reward("Changed catalogue", 10);
    await rewards.save("owner-a", org, changed, null, {
      action: "edit",
      name: "Changed catalogue",
      description: "Updated price",
      cost: 15,
      stock: null,
      version: 1,
    });
    assert.equal(
      result(await store.claim("child-a", org, changed, crypto.randomUUID(), 1))
        .code,
      "conflict",
    );
    const limited = await reward("Last drink", 30, 1),
      keys = [crypto.randomUUID(), crypto.randomUUID()];
    const competing = await Promise.all(
        users.map((u, i) => store.claim(u.id, org, limited, keys[i]!, 1)),
      ),
      results = competing.map(result),
      win = results.findIndex((r) => r.id),
      winner = users[win]!,
      claimId = results[win]!.id!;
    assert.equal(results.filter((r) => r.id).length, 1);
    assert.equal(results.find((r) => r.code)?.code, "reward_out_of_stock");
    assert.equal(
      result(await store.claim(winner.id, org, limited, keys[win]!, 1)).id,
      claimId,
    );
    assert.equal(
      result(await store.claim(winner.id, org, limited, keys[win]!, 2)).code,
      "conflict",
    );
    const coupon = (await store.get(winner.id, org, claimId))[0]!;
    assert.match(String(coupon.code), /^[0-9a-f]{64}$/);
    assert.equal("personId" in coupon, false);
    assert.equal("createdByName" in coupon, false);
    assert.equal((await store.get(users[1 - win]!.id, org, claimId)).length, 0);
    assert.equal(
      (await store.preview("owner-b", other, String(coupon.code))).length,
      0,
    );
    assert.equal(
      (await store.preview("vol-a", org, String(coupon.code))).length,
      0,
    );
    const request = (path: string, method = "GET", body?: unknown) =>
      new Request(origin + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: "session=fixture",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const call = (
      user: (typeof users)[number],
      path: string,
      method = "GET",
      body?: unknown,
    ) => couponApi(request(path, method, body), user, organizations, store);
    const ownBase = `/api/organizations/${org}/me/coupons`,
      collection = `/api/organizations/${org}/coupon-collection`;
    assert.equal(
      (await call({ ...winner, emailVerified: false }, ownBase))!.status,
      403,
    );
    assert.equal(
      (await call(winner, collection, "POST", { code: coupon.code }))!.status,
      403,
    );
    assert.equal(
      (await call(
        {
          id: "vol-a",
          name: "Volunteer",
          email: "v@example.invalid",
          emailVerified: true,
        },
        collection,
        "POST",
        { code: coupon.code },
      ))!.status,
      403,
    );
    assert.equal(
      (await call(users[1 - win]!, ownBase + "/" + claimId, "PATCH", {
        action: "cancelled",
        version: 1,
      }))!.status,
      404,
    );
    assert.equal(
      (await call(winner, ownBase + "/" + claimId, "PATCH", {
        action: "fulfilled",
        version: 1,
      }))!.status,
      403,
    );
    const catalog = await reward("Book coupon", 40);
    const spoof = await call(
      users[0]!,
      `/api/organizations/${org}/me/claims`,
      "POST",
      {
        rewardId: catalog,
        rewardVersion: 1,
        key: crypto.randomUUID(),
        personId: pb,
        cost: 1,
      },
    );
    assert.equal(spoof!.status, 201);
    const own = (await spoof!.json()).item;
    assert.equal(own.cost, 40);
    assert.equal((await store.get("child-b", org, own.id)).length, 0);
    assert.equal(spoof!.headers.get("Cache-Control"), "no-store");
    const before = (await participants.summary("child-a", org))[0]!;
    await call(users[0]!, ownBase + "/" + own.id, "PATCH", {
      action: "cancelled",
      version: 1,
    });
    await call(users[0]!, ownBase + "/" + own.id, "PATCH", {
      action: "cancelled",
      version: 1,
    });
    const after = (await participants.summary("child-a", org))[0]!;
    assert.equal(
      BigInt(String(after.available)) - BigInt(String(before.available)),
      40n,
    );
    assert.equal((await store.get("child-a", org, own.id))[0]!.code, null);
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::int n from hub_reward_changes where redemption_id=$1 and action='participant_cancel'`,
          [own.id],
        )
      ).rows[0]!.n,
      1,
    );
    const staff = {
      id: "owner-a",
      name: "Organizer",
      email: "o@example.invalid",
      emailVerified: true,
    };
    assert.equal(
      (await call(staff, collection, "PATCH", {
        code: own.code,
        action: "fulfilled",
        version: 1,
      }))!.status,
      409,
    );
    const collected = await call(staff, collection, "PATCH", {
      code: coupon.code,
      action: "fulfilled",
      version: 1,
    });
    assert.equal(collected!.status, 200);
    assert.equal((await collected!.json()).item.status, "fulfilled");
    await call(staff, collection, "PATCH", {
      code: coupon.code,
      action: "fulfilled",
      version: 1,
    });
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::int n from hub_reward_changes where redemption_id=$1 and action='fulfilled'`,
          [claimId],
        )
      ).rows[0]!.n,
      1,
    );
    assert.equal((await store.get(winner.id, org, claimId))[0]!.code, null);
    const expensive1 = await reward("Large reward A", 60),
      expensive2 = await reward("Large reward B", 60);
    const walletRace = (
      await Promise.all([
        store.claim("child-b", org, expensive1, crypto.randomUUID(), 1),
        store.claim("child-b", org, expensive2, crypto.randomUUID(), 1),
      ])
    ).map(result);
    assert.equal(walletRace.filter((r) => r.id).length, 1);
    assert.equal(walletRace.find((r) => r.code)?.code, "reward_balance");
    const racingReward = await reward("Small reward", 1),
      raceId = result(
        await store.claim("child-a", org, racingReward, crypto.randomUUID(), 1),
      ).id!,
      raceCode = String((await store.get("child-a", org, raceId))[0]!.code);
    const race = (
      await Promise.all([
        store.cancel("child-a", org, raceId, 1),
        store.collect("owner-a", org, raceCode, 1),
      ])
    ).map(result);
    assert.equal(race.filter((r) => r.id).length, 1);
    const final = (await store.get("child-a", org, raceId))[0]!;
    assert.ok(["cancelled", "fulfilled"].includes(String(final.status)));
    assert.equal(final.code, null);
    // New staff reservations receive codes too; no separate spending system is created.
    const staffed = result(
      await rewards.redeem(
        "owner-a",
        org,
        racingReward,
        null,
        crypto.randomUUID(),
        { personId: pa, rewardVersion: 1 },
      ),
    ).id!;
    assert.match(
      String((await store.get("child-a", org, staffed))[0]!.code),
      /^[0-9a-f]{64}$/,
    );
    await db.exec(
      `create function fail_coupon_audit() returns trigger language plpgsql as $$ begin if NEW.action='participant_claim' then raise exception 'injected audit failure'; end if; return NEW; end; $$; create trigger fail_coupon_audit before insert on hub_reward_changes for each row execute function fail_coupon_audit();`,
    );
    const nBefore = (
      await db.query<{ n: number }>(
        `select count(*)::int n from hub_reward_coupons`,
      )
    ).rows[0]!.n;
    await assert.rejects(() =>
      store.claim("child-a", org, racingReward, crypto.randomUUID(), 1),
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::int n from hub_reward_coupons`,
        )
      ).rows[0]!.n,
      nBefore,
    );
    await db.exec(
      `drop trigger fail_coupon_audit on hub_reward_changes; drop function fail_coupon_audit();`,
    );
    const selfCode = String(
        (await store.get("child-a", org, staffed))[0]!.code,
      ),
      account = (await participants.account("owner-a", org, pa))[0]!,
      link = account.link as { id: string };
    await participants.revoke(
      "owner-a",
      org,
      pa,
      link.id,
      "link",
      "Change to staff",
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role) values($1,'child-a','admin')`,
      [org],
    );
    assert.equal(
      result(await store.claim("child-a", org, limited, keys[0]!, 1)).code,
      "forbidden",
    );
    assert.equal((await store.get("child-a", org, staffed)).length, 0);
    assert.equal(
      (await store.preview("child-a", org, selfCode))[0]!.canCollect,
      false,
    );
    assert.equal(
      result(await store.collect("child-a", org, selfCode, 1)).code,
      "forbidden",
    );
    const p = pageInput(new URL(origin + "?limit=1"), org);
    assert.ok((await store.list("child-b", org, p, "all")).length <= 2);
    await assert.rejects(() =>
      db.query(
        `update hub_reward_coupons set code=repeat('b',64) where redemption_id=$1`,
        [staffed],
      ),
    );
    assert.equal(
      (
        await db.query<{ n: string }>(
          `select sum(amount)::text n from hub_points_entries where organization_id=$1`,
          [org],
        )
      ).rows[0]!.n,
      "200",
    );
    let allowed = true;
    const env: Env = {
      HIMMAH_APP_ORIGIN: origin,
      HIMMAH_AUTH_URL: "https://auth.example.invalid/auth",
      HIMMAH_DATABASE_URL: url,
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      ONBOARDING_LIMITER: { limit: async () => ({ success: allowed }) },
    };
    const worker = createHandler({
      store: () => organizations,
      coupons: () => store,
      fetch: async () => Response.json({ user: users[1] }),
    });
    assert.equal(
      (
        await worker(
          new Request(
            request(ownBase + "/" + claimId, "PATCH", {
              action: "cancelled",
              version: 1,
            }),
            {
              headers: {
                Origin: "https://evil.invalid",
                "Content-Type": "application/json",
                Cookie: "session=fixture",
              },
            },
          ),
          env,
        )
      ).status,
      403,
    );
    allowed = false;
    assert.equal(
      (
        await worker(
          request(`/api/organizations/${org}/me/claims`, "POST", {
            rewardId: catalog,
            key: crypto.randomUUID(),
            rewardVersion: 1,
          }),
          env,
        )
      ).status,
      429,
    );
  } finally {
    await db.close();
  }
});
