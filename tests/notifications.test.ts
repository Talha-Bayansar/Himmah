import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createNotificationStore } from "../src/server/notification-store.ts";
import { createParticipantStore } from "../src/server/participant-store.ts";
import { createStore } from "../src/server/store.ts";
import { notificationApi } from "../src/server/notification-api.ts";
import {
  pageInput,
  pageResult,
  newToken,
  tokenHash,
} from "../src/community/contracts.ts";
import { pushEndpoint, pushInput } from "../src/notifications/contracts.ts";
import { deliverPush } from "../src/server/push-delivery.ts";
import webpush from "web-push";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const encoded = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
async function keys() {
  const k = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  return {
    p256dh: encoded(
      new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey)),
    ),
    auth: encoded(crypto.getRandomValues(new Uint8Array(16))),
  };
}
test("push validates provider HTTPS endpoints, key lengths, locale and blocks SSRF destinations", async () => {
  const valid = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    keys: await keys(),
    locale: "nl",
  };
  assert.equal(pushInput(valid).locale, "nl");
  for (const endpoint of [
    "http://fcm.googleapis.com/x",
    "https://localhost/x",
    "https://169.254.169.254/",
    "https://fcm.googleapis.com.evil.test/x",
    "https://fcm.googleapis.com:444/x",
    "https://user:secret@fcm.googleapis.com/x",
    "https://web.push.apple.com/x#secret",
  ])
    assert.throws(() => pushEndpoint(endpoint));
  for (const change of [
    { locale: "xx" },
    { keys: { p256dh: "bad", auth: "bad" } },
  ])
    assert.throws(() => pushInput({ ...valid, ...change }));
});
test("transactional notifications: recipient snapshots, tenant/role access, cursors, read states, outbox leases, delivery, revocation and retry deduplication", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../db/migrations/generated/", import.meta.url),
      journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", dir), "utf8"),
      );
    for (const e of journal.entries)
      await db.exec(await readFile(new URL(e.tag + ".sql", dir), "utf8"));
    const dialect = new PgDialect(),
      execute = async (st: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query(q.sql, q.params)).rows as Record<
          string,
          unknown
        >[];
      },
      url = "postgresql://test:test@localhost/test",
      store = createNotificationStore(url, execute),
      participants = createParticipantStore(url, execute),
      organizations = createStore(url, execute);
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Test A','test-a','UTC','owner',$3),($2,'Test B','test-b','UTC','outsider',$4)`,
      [org, other, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role) values($1,'owner','owner'),($1,'admin','admin'),($1,'volunteer','volunteer'),($2,'outsider','owner')`,
      [org, other],
    );
    const person = crypto.randomUUID();
    await db.query(
      `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,'Nickname','owner',$3,'owner')`,
      [person, org, crypto.randomUUID()],
    );
    const child = {
        id: "child",
        email: "child@example.invalid",
        emailVerified: true,
        name: "Nickname",
      },
      hash = await tokenHash(newToken());
    await participants.invite(
      "owner",
      org,
      person,
      crypto.randomUUID(),
      child.email,
      hash,
      true,
    );
    await participants.accept(child, hash);
    const sub = {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        keys: await keys(),
        locale: "en",
      },
      b = pushInput(sub);
    assert.equal((await store.register(child.id, b))[0]?.ok, true);
    assert.equal((await store.register("outsider", b))[0]?.ok, false);
    const event = crypto.randomUUID(),
      href = `/workspace/${org}/me`;
    await db.query("select hub_notify_person($1,$2,$3,$4,$5)", [
      org,
      person,
      event,
      "points_awarded",
      href,
    ]);
    await db.query("select hub_notify_person($1,$2,$3,$4,$5)", [
      org,
      person,
      event,
      "points_awarded",
      href,
    ]);
    const input = pageInput(
      new URL("https://test.invalid?limit=1"),
      `child:${org}/notifications`,
    );
    assert.equal((await store.unread("child", org))[0]?.count, 1);
    assert.equal((await store.list("outsider", org, input)).length, 0);
    assert.equal((await store.list("owner", org, input)).length, 0);
    const notification = (await store.list("child", org, input))[0]!;
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from hub_push_deliveries",
        )
      ).rows[0]!.count,
      1,
    );
    const first = await store.claim();
    assert.equal(first.length, 1);
    assert.equal((await store.claim()).length, 0);
    await store.finish(String(first[0]!.id), crypto.randomUUID(), "sent", 0);
    assert.equal(
      (await store.target(String(first[0]!.id), String(first[0]!.lease)))
        .length,
      1,
    );
    await store.finish(
      String(first[0]!.id),
      String(first[0]!.lease),
      "pending",
      0,
    );
    const vapid = webpush.generateVAPIDKeys(),
      env = {
        HIMMAH_DATABASE_URL: url,
        HIMMAH_APP_ORIGIN: "https://himmah.example",
        HIMMAH_VAPID_PUBLIC_KEY: vapid.publicKey,
        HIMMAH_VAPID_PRIVATE_KEY: vapid.privateKey,
      };
    let sends = 0;
    await deliverPush(env, {
      store,
      fetch: async (_input, init) => {
        sends++;
        assert.equal(init?.redirect, "manual");
        assert.equal(
          new Headers(init?.headers).get("Content-Encoding"),
          "aes128gcm",
        );
        assert.ok(
          new Headers(init?.headers).get("Authorization")?.startsWith("vapid "),
        );
        assert.ok(init?.body);
        return new Response(null, { status: 201 });
      },
    });
    assert.equal(sends, 1);
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from hub_push_deliveries",
        )
      ).rows[0]!.state,
      "sent",
    );
    await store.read("outsider", org, String(notification.id));
    assert.equal((await store.unread("child", org))[0]?.count, 1);
    await store.read("child", org, String(notification.id));
    await store.read("child", org, String(notification.id));
    assert.equal((await store.unread("child", org))[0]?.count, 0);
    await db.query("select hub_notify_person($1,$2,$3,$4,$5)", [
      org,
      person,
      crypto.randomUUID(),
      "points_corrected",
      href,
    ]);
    const page = pageResult(
      (await store.list("child", org, input)) as {
        id: string;
        createdAt: string;
      }[],
      input,
    );
    assert.ok(page.nextCursor);
    const next = pageInput(
      new URL(
        "https://test.invalid?limit=1&cursor=" +
          encodeURIComponent(page.nextCursor!),
      ),
      `child:${org}/notifications`,
    );
    assert.equal((await store.list("child", org, next)).length, 1);
    assert.throws(() =>
      pageInput(
        new URL(
          "https://test.invalid?cursor=" + encodeURIComponent(page.nextCursor!),
        ),
        `outsider:${org}/notifications`,
      ),
    );
    await db.query("select hub_notify_admins($1,$2,$3,$4,$5)", [
      org,
      crypto.randomUUID(),
      "challenge_pending",
      `/workspace/${org}/challenges`,
      "owner",
    ]);
    assert.equal((await store.unread("owner", org))[0]?.count, 0);
    assert.equal((await store.unread("admin", org))[0]?.count, 1);
    assert.equal((await store.unread("volunteer", org))[0]?.count, 0);
    await db.query(
      `update hub_memberships set role='volunteer' where user_id='admin' and organization_id=$1`,
      [org],
    );
    assert.equal((await store.unread("admin", org))[0]?.count, 0);
    const call = (
      path: string,
      user = child,
      method = "GET",
      body: unknown = undefined,
    ) =>
      notificationApi(
        new Request("https://test.invalid" + path, {
          method,
          ...(body
            ? {
                body: JSON.stringify(body),
                headers: { "Content-Type": "application/json" },
              }
            : {}),
        }),
        user,
        organizations,
        store,
        vapid.publicKey,
      );
    assert.equal(
      (await call(`/api/organizations/${other}/notifications`))?.status,
      404,
    );
    assert.equal(
      (
        await call(`/api/organizations/${org}/notifications`, {
          ...child,
          emailVerified: false,
        })
      )?.status,
      403,
    );
    assert.equal(
      (
        await call("/api/notifications/push", child, "POST", {
          ...sub,
          endpoint: "https://localhost/",
        })
      )?.status,
      400,
    );
    assert.equal(
      (await call(`/api/organizations/${org}/notifications`))?.status,
      200,
    );
    assert.equal(
      (await call("/api/notifications/push", child, "POST", sub))?.status,
      200,
    );
    const invalidCurve = new Uint8Array(65);
    invalidCurve[0] = 4;
    assert.equal(
      (
        await call("/api/notifications/push", child, "POST", {
          ...sub,
          keys: { ...sub.keys, p256dh: encoded(invalidCurve) },
        })
      )?.status,
      400,
    );
    // Point insert trigger shares the ledger transaction and snapshots no private content.
    const request = crypto.randomUUID();
    await db.query(
      `insert into hub_points_requests(organization_id,id,request_key,actor_id,payload,response) values($1,$2,$3,'owner','{}','{}')`,
      [org, request, crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_points_entries(organization_id,person_id,request_id,actor_id,amount,reason,occurred_at) values($1,$2,$3,'owner',5,'Private staff note',now())`,
      [org, person, request],
    );
    assert.equal(
      (await store.list("child", org, { ...input, limit: 25 })).filter(
        (n) => n.kind === "points_awarded",
      ).length,
      2,
    );
    assert.ok(
      !JSON.stringify(
        await store.list("child", org, { ...input, limit: 25 }),
      ).includes("Private staff note"),
    );
    const before = (
      await db.query<{ count: number }>(
        "select count(*)::int as count from hub_notifications",
      )
    ).rows[0]!.count;
    await db.exec("BEGIN");
    await db.query("select hub_notify_person($1,$2,$3,$4,$5)", [
      org,
      person,
      crypto.randomUUID(),
      "points_awarded",
      href,
    ]);
    await db.exec("ROLLBACK");
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from hub_notifications",
        )
      ).rows[0]!.count,
      before,
    );
    // Transient provider errors retain a bounded retry; terminal expiration removes device/jobs.
    await deliverPush(env, {
      store,
      fetch: async () => new Response(null, { status: 503 }),
    });
    assert.ok(
      (
        await db.query(
          `select 1 from hub_push_deliveries where state='pending' and next_at>now()`,
        )
      ).rows.length > 0,
    );
    await db.exec(
      `update hub_push_deliveries set next_at=now() where state='pending'`,
    );
    await deliverPush(env, {
      store,
      fetch: async () => new Response(null, { status: 410 }),
    });
    assert.equal((await store.device("child", sub.endpoint)).length, 0);
    await store.register("child", b);
    await db.query("select hub_notify_person($1,$2,$3,$4,$5)", [
      org,
      person,
      crypto.randomUUID(),
      "points_awarded",
      href,
    ]);
    await db.query(
      `update hub_participant_links set revoked_at=now(),revoked_by='owner',revoke_reason='Test' where organization_id=$1 and user_id='child'`,
      [org],
    );
    assert.equal((await store.list("child", org, input)).length, 0);
    let leaked = false;
    await deliverPush(env, {
      store,
      fetch: async () => {
        leaked = true;
        return new Response(null, { status: 201 });
      },
    });
    assert.equal(leaked, false);
    // Ten devices maximum, independent endpoint ownership, and all-device disable is account scoped.
    for (let i = 0; i < 9; i++)
      assert.equal(
        (await store.register("child", { ...b, endpoint: sub.endpoint + i }))[0]
          ?.ok,
        true,
      );
    assert.equal(
      (
        await store.register("child", {
          ...b,
          endpoint: sub.endpoint + "overflow",
        })
      )[0]?.ok,
      false,
    );
    await store.register("outsider", {
      ...b,
      endpoint: sub.endpoint + "outsider",
    });
    await store.remove("child", null);
    assert.equal(
      (await store.device("outsider", sub.endpoint + "outsider")).length,
      1,
    );
    assert.equal(
      (
        await call(
          "/api/notifications/push/all",
          { ...child, id: "outsider", emailVerified: false },
          "DELETE",
          {},
        )
      )?.status,
      200,
    );
    assert.equal(
      (await store.device("outsider", sub.endpoint + "outsider")).length,
      0,
    );
  } finally {
    await db.close();
  }
});
