import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import {
  contentInput,
  staffInput,
  hashToken,
  secretToken,
} from "../src/learning/contracts.ts";
import { createLearningStore } from "../src/server/learning-store.ts";
import { learningApi, learningPublicApi } from "../src/server/learning-api.ts";
import { createStore } from "../src/server/store.ts";
const content = {
  title: "Patience",
  description: "Knowledge check",
  mode: "assigned" as const,
  release: "manual" as const,
  opensAt: "",
  closesAt: "",
  questions: [
    {
      text: "Choose the correct answer",
      choices: ["First", "Second"],
      correct: 1,
      explanation: "Second is correct",
    },
    {
      text: "Another question",
      choices: ["Yes", "No"],
      correct: 0,
      explanation: "",
    },
  ],
};
test("learning validates question bounds, choices, instants and opaque tokens", async () => {
  assert.deepEqual(contentInput(content), content);
  for (const v of [
    { ...content, questions: [] },
    { ...content, mode: "any" },
    { ...content, questions: [{ ...content.questions[0], correct: 2 }] },
    { ...content, opensAt: "invalid" },
    { ...content, closesAt: "2020-01-01T00:00Z", opensAt: "2021-01-01T00:00Z" },
  ])
    assert.throws(() => contentInput(v));
  assert.equal(secretToken().length, 64);
  assert.equal((await hashToken("a".repeat(64))).length, 64);
  assert.throws(() =>
    staffInput({
      action: "open-link",
      key: crypto.randomUUID(),
      version: 1,
      publication: crypto.randomUUID(),
      token: "short",
    }),
  );
});
test("learning API/SQL scopes immutable publication, contact and guest attempts, release and exact retries", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      execute = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<any>(q.sql, q.params)).rows;
      };
    const store = createLearningStore(
        "postgres://isolated:only@localhost/himmah",
        execute,
      ),
      organizations = createStore(
        "postgres://isolated:only@localhost/himmah",
        execute,
      ),
      org = crypto.randomUUID(),
      foreign = crypto.randomUUID(),
      item = crypto.randomUUID(),
      person = crypto.randomUUID();
    for (const [id, user, slug] of [
      [org, "owner", "learn-org"],
      [foreign, "other", "learn-other"],
    ]) {
      await db.query(
        "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Community',$2,'Europe/Brussels',$3,gen_random_uuid())",
        [id, slug, user],
      );
      await db.query(
        "insert into hub_memberships(organization_id,user_id,role)values($1,$2,'owner')",
        [id, user],
      );
    }
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'helper','volunteer')",
      [org],
    );
    await db.query(
      "insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,'Alex','owner','owner')",
      [person, org],
    );
    let version = 1;
    const cmd = async (
      action: string,
      extra: Record<string, unknown> = {},
      actor = "owner",
      target = org,
    ) => {
      const rows = await store.command(
        actor,
        target,
        item,
        crypto.randomUUID(),
        { action, version, ...extra },
      );
      const r = rows[0]!.result as any;
      if (!r.error) version = r.version;
      return r;
    };
    assert.equal(
      (await cmd("create", { content, activity: null, session: null })).id,
      item,
    );
    assert.equal((await cmd("publish", {}, "helper")).error, "forbidden");
    assert.equal(
      (await cmd("publish", {}, "other", foreign)).error,
      "not_found",
    );
    const published = await cmd("publish");
    const pub = published.publication;
    assert.ok(pub);
    const token = "a".repeat(64),
      hash = await hashToken(token);
    await cmd("assign", {
      publication: pub,
      recipients: [{ contact: person, hash }],
    });
    let publicData = (await store.public(item, hash, ""))[0]!.result as any;
    assert.equal(publicData.name, "Alex");
    assert.equal(publicData.questions[0].correct, undefined);
    assert.equal(publicData.questions[0].explanation, undefined);
    const startKey = crypto.randomUUID(),
      startBody = {
        action: "start",
        name: "ignored",
        guestHash: await hashToken("b".repeat(64)),
      };
    let r = (await store.participate(item, hash, "", startKey, startBody))[0]!
      .result as any;
    assert.ok(r.id);
    const attempt = r.id;
    assert.deepEqual(
      (await store.participate(item, hash, "", startKey, startBody))[0]!.result,
      r,
    );
    assert.equal(
      (
        (
          await store.participate(item, hash, "", startKey, {
            ...startBody,
            name: "changed",
          })
        )[0]!.result as any
      ).error,
      "conflict",
    );
    let revision = r.revision;
    for (const [question, choice] of [
      [0, 1],
      [1, 0],
    ]) {
      r = (
        await store.participate(item, hash, "", crypto.randomUUID(), {
          action: "answer",
          attempt,
          revision,
          question,
          choice,
        })
      )[0]!.result as any;
      assert.equal(r.error, undefined);
      revision = r.revision;
    }
    const submitKey = crypto.randomUUID(),
      submitBody = { action: "submit", attempt, revision };
    r = (await store.participate(item, hash, "", submitKey, submitBody))[0]!
      .result as any;
    assert.ok(r.id);
    assert.deepEqual(
      (await store.participate(item, hash, "", submitKey, submitBody))[0]!
        .result,
      r,
    );
    publicData = (await store.public(item, hash, ""))[0]!.result as any;
    assert.equal(publicData.attempt.score, null);
    assert.equal(publicData.questions[0].correct, undefined);
    assert.equal(
      (
        (
          await store.participate(
            item,
            hash,
            "",
            crypto.randomUUID(),
            startBody,
          )
        )[0]!.result as any
      ).error,
      "learning_attempt_limit",
    );
    await cmd("release", { publication: pub });
    publicData = (await store.public(item, hash, ""))[0]!.result as any;
    assert.equal(publicData.attempt.score, 2);
    assert.equal(publicData.questions[0].correct, 1);
    assert.equal(publicData.questions[0].explanation, "Second is correct");
    await assert.rejects(
      db.query("update hub_learning_attempts set score=0 where id=$1", [
        attempt,
      ]),
    );
    await assert.rejects(
      db.query("update hub_learning_versions set content='{}' where id=$1", [
        pub,
      ]),
    );
    await assert.rejects(db.query("delete from hub_learning_operations"));
    await assert.rejects(
      db.query("update hub_learning_versions set released=false where id=$1", [
        pub,
      ]),
    );
    const recipient = (
      await db.query<any>(
        "select id,revision from hub_learning_recipients where publication_id=$1",
        [pub],
      )
    ).rows[0]!;
    await cmd("allow", {
      publication: pub,
      recipient: recipient.id,
      recipientRevision: recipient.revision,
    });
    r = (
      await store.participate(item, hash, "", crypto.randomUUID(), startBody)
    )[0]!.result as any;
    assert.notEqual(r.id, attempt);
    assert.equal(
      ((await store.public(item, hash, ""))[0]!.result as any).questions[0]
        .correct,
      undefined,
    );
    // Save and republish cannot rewrite the old version or old answers.
    await cmd("save", {
      content: {
        ...content,
        title: "New title",
        questions: [
          { ...content.questions[0], correct: 0 },
          content.questions[1],
        ],
      },
      activity: null,
      session: null,
    });
    const republished = await cmd("publish");
    assert.notEqual(republished.publication, pub);
    assert.equal(
      ((await store.public(item, hash, ""))[0]!.result as any).available,
      false,
    );
    assert.equal(
      (
        (
          await store.participate(item, hash, "", crypto.randomUUID(), {
            action: "answer",
            attempt: r.id,
            revision: r.revision,
            question: 0,
            choice: 0,
          })
        )[0]!.result as any
      ).error,
      "learning_closed",
    );
    assert.equal(
      (
        await db.query<any>(
          "select score from hub_learning_attempts where id=$1",
          [attempt],
        )
      ).rows[0]!.score,
      2,
    );
    // Open participation stays detached from contacts; private resumption credentials are required.
    await cmd("save", {
      content: { ...content, mode: "open", release: "immediate" },
      activity: null,
      session: null,
    });
    const open = await cmd("publish"),
      openToken = "c".repeat(64),
      openHash = await hashToken(openToken);
    await cmd("open-link", { publication: open.publication, hash: openHash });
    const guestToken = "d".repeat(64),
      guestHash = await hashToken(guestToken),
      guestKey = crypto.randomUUID(),
      guestBody = { action: "start", guestHash, name: "Guest Alex" };
    r = (await store.participate(item, openHash, "", guestKey, guestBody))[0]!
      .result as any;
    assert.ok(r.guestStarted);
    assert.deepEqual(
      (await store.participate(item, openHash, "", guestKey, guestBody))[0]!
        .result,
      r,
    );
    assert.equal(
      ((await store.public(item, openHash, ""))[0]!.result as any).attempt,
      null,
    );
    publicData = (await store.public(item, openHash, guestHash))[0]!
      .result as any;
    assert.equal(publicData.name, "Guest Alex");
    assert.equal(publicData.attempt.id, r.id);
    assert.equal(
      (
        await db.query<any>(
          "select contact_id from hub_learning_recipients where guest_hash=$1",
          [guestHash],
        )
      ).rows[0]!.contact_id,
      null,
    );
    const guest = (
      await db.query<any>(
        "select id,revision from hub_learning_recipients where guest_hash=$1",
        [guestHash],
      )
    ).rows[0]!;
    await cmd("revoke", {
      publication: open.publication,
      recipient: guest.id,
      recipientRevision: guest.revision,
    });
    assert.equal(
      ((await store.public(item, openHash, guestHash))[0]!.result as any).error,
      "not_found",
    );
    const admin = { id: "owner", emailVerified: true },
      api = (url: string, user = admin, init?: RequestInit) =>
        learningApi(
          new Request(
            `https://himmah.test/api/organizations/${org}/learning${url}`,
            init,
          ),
          user,
          organizations,
          store,
        );
    assert.equal(
      (await api("", { id: "helper", emailVerified: true }))!.status,
      403,
    );
    assert.equal(
      (await api("", { id: "owner", emailVerified: false }))!.status,
      403,
    );
    assert.equal((await api(""))!.headers.get("cache-control"), "no-store");
    assert.equal((await api("/" + item))!.status, 200);
    const access = await learningPublicApi(
      new Request(`https://himmah.test/api/learning/public/${item}/access`, {
        method: "POST",
        body: JSON.stringify({ token: openToken }),
      }),
      store,
    );
    assert.equal(access!.status, 200);
    assert.match(
      access!.headers.get("set-cookie")!,
      /HttpOnly; Secure; SameSite=Strict/,
    );
    assert.deepEqual(await access!.json(), { ok: true });
    // Authority precedes successful command receipt replay.
    const k = crypto.randomUUID(),
      payload = { action: "close", version };
    const close = (await store.command("owner", org, item, k, payload))[0]!
      .result as any;
    assert.ok(close.id);
    await db.query(
      "delete from hub_memberships where organization_id=$1 and user_id='owner'",
      [org],
    );
    assert.equal(
      ((await store.command("owner", org, item, k, payload))[0]!.result as any)
        .error,
      "forbidden",
    );
    assert.equal(
      (await db.query<any>("select count(*)::int n from hub_attendance"))
        .rows[0]!.n,
      0,
    );
    assert.equal(
      (await db.query<any>("select count(*)::int n from hub_cash_receipts"))
        .rows[0]!.n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("learning enforces availability, whole-batch validation, link rotation and filter-bound pagination", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      execute = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<any>(q.sql, q.params)).rows;
      };
    const store = createLearningStore(
        "postgres://isolated:only@localhost/himmah",
        execute,
      ),
      org = crypto.randomUUID(),
      foreign = crypto.randomUUID();
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Learning','learning-boundary','UTC','owner',gen_random_uuid()),($2,'Other','learning-other-boundary','UTC','other',gen_random_uuid())",
      [org, foreign],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')",
      [org],
    );
    const id = crypto.randomUUID();
    let version = 1;
    const cmd = async (action: string, extra: Record<string, unknown> = {}) => {
      const r = (
        await store.command("owner", org, id, crypto.randomUUID(), {
          action,
          version,
          ...extra,
        })
      )[0]!.result as any;
      if (!r.error) version = r.version;
      return r;
    };
    await cmd("create", {
      content: { ...content, mode: "open", opensAt: "2099-01-01T00:00:00Z" },
      activity: null,
      session: null,
    });
    const published = await cmd("publish");
    const h = await hashToken("e".repeat(64));
    await cmd("open-link", { publication: published.publication, hash: h });
    assert.equal(
      ((await store.public(id, h, ""))[0]!.result as any).available,
      false,
    );
    const start = {
      action: "start",
      name: "Guest",
      guestHash: await hashToken("f".repeat(64)),
    };
    assert.equal(
      (
        (await store.participate(id, h, "", crypto.randomUUID(), start))[0]!
          .result as any
      ).error,
      "learning_closed",
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from hub_learning_recipients",
        )
      ).rows[0]!.n,
      0,
    );
    await cmd("save", {
      content: { ...content, mode: "open" },
      activity: null,
      session: null,
    });
    const live = await cmd("publish");
    const liveHash = await hashToken("1".repeat(64));
    await cmd("open-link", { publication: live.publication, hash: liveHash });
    assert.equal(
      ((await store.public(id, liveHash, ""))[0]!.result as any).available,
      true,
    );
    const replacement = await hashToken("2".repeat(64));
    await cmd("open-link", {
      publication: live.publication,
      hash: replacement,
    });
    assert.equal(
      ((await store.public(id, liveHash, ""))[0]!.result as any).error,
      "not_found",
    );
    await cmd("close");
    assert.equal(
      (
        (
          await store.participate(
            id,
            replacement,
            "",
            crypto.randomUUID(),
            start,
          )
        )[0]!.result as any
      ).error,
      "learning_closed",
    );
    await cmd("reopen");
    await cmd("save", { content, activity: null, session: null });
    const assigned = await cmd("publish");
    const a = crypto.randomUUID(),
      b = crypto.randomUUID();
    await db.query(
      "insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,'Valid','owner','owner'),($3,$4,'Foreign','other','other')",
      [a, org, b, foreign],
    );
    assert.equal(
      (
        await cmd("assign", {
          publication: assigned.publication,
          recipients: [
            { contact: a, hash: await hashToken("3".repeat(64)) },
            { contact: b, hash: await hashToken("4".repeat(64)) },
          ],
        })
      ).error,
      "invalid_input",
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from hub_learning_recipients",
        )
      ).rows[0]!.n,
      0,
    );
    const organizations = createStore(
      "postgres://isolated:only@localhost/himmah",
      execute,
    );
    for (let n = 0; n < 27; n++) {
      await store.command(
        "owner",
        org,
        crypto.randomUUID(),
        crypto.randomUUID(),
        {
          action: "create",
          content: { ...content, title: "Paged " + n },
          activity: null,
          session: null,
        },
      );
    }
    const request = async (search: string) =>
      learningApi(
        new Request(
          "https://himmah.test/api/organizations/" + org + "/learning" + search,
        ),
        { id: "owner", emailVerified: true },
        organizations,
        store,
      );
    const first = (await (await request("?limit=25"))!.json()) as any;
    assert.equal(first.items.length, 25);
    assert.ok(first.nextCursor);
    const next = (await (await request(
      "?limit=25&cursor=" + first.nextCursor,
    ))!.json()) as any;
    assert.equal(
      new Set([...first.items, ...next.items].map((r: any) => r.id)).size,
      28,
    );
    assert.equal(
      (await request("?q=changed&cursor=" + first.nextCursor))!.status,
      400,
    );
    // A failing audit must roll back the command and its retry receipt together.
    await db.exec(
      "CREATE FUNCTION fail_learning_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit failure';END$$; CREATE TRIGGER fail_learning_audit BEFORE INSERT ON hub_directory_audit FOR EACH ROW EXECUTE FUNCTION fail_learning_audit();",
    );
    const before = (
      await db.query<any>("select count(*)::int n from hub_learning_items")
    ).rows[0]!.n;
    await assert.rejects(
      store.command("owner", org, crypto.randomUUID(), crypto.randomUUID(), {
        action: "create",
        content,
        activity: null,
        session: null,
      }),
    );
    assert.equal(
      (await db.query<any>("select count(*)::int n from hub_learning_items"))
        .rows[0]!.n,
      before,
    );
  } finally {
    await db.close();
  }
});

test("Learning Worker dispatch allows public credentials without staff auth and preserves same-origin, verification, feature gates and rate limits", async () => {
  const { createHandler } = await import("../src/server/worker.ts");
  const { createLearningStore } =
    await import("../src/server/learning-store.ts");
  const item = crypto.randomUUID(),
    org = crypto.randomUUID();
  let calls = 0,
    authCalls = 0;
  const store = createLearningStore(
    "postgres://isolated:only@localhost/himmah",
    async () => {
      calls++;
      return [
        { result: { title: "Public quiz", questions: [], available: true } },
      ];
    },
  );
  const handler = createHandler({
    learning: () => store,
    fetch: async () => {
      authCalls++;
      return Response.json({
        user: {
          id: "helper",
          email: "helper@example.test",
          name: "Helper",
          emailVerified: true,
        },
        session: { id: "session", expiresAt: "2099-01-01" },
      });
    },
    store: () => ({ get: async () => ({ id: org, role: "volunteer" }) }) as any,
  });
  const env = {
    HIMMAH_APP_ORIGIN: "https://himmah.test",
    HIMMAH_AUTH_URL: "https://auth.invalid/auth",
    HIMMAH_DATABASE_URL: "isolated",
    HIMMAH_PEOPLE_ENABLED: "true",
    ONBOARDING_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response("", { status: 404 }) },
  };
  const pub = `https://himmah.test/api/learning/public/${item}`;
  assert.equal(
    (
      await handler(
        new Request(pub, {
          headers: { cookie: "hl_access=" + "a".repeat(64) },
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(authCalls, 0);
  assert.equal(calls, 1);
  assert.equal(
    (
      await handler(
        new Request(pub + "/access", {
          method: "POST",
          headers: {
            origin: "https://evil.test",
            "content-type": "application/json",
          },
          body: JSON.stringify({ token: "a".repeat(64) }),
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(calls, 1);
  assert.equal(
    (
      await handler(new Request(pub), {
        ...env,
        HIMMAH_PEOPLE_ENABLED: "false",
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await handler(new Request(pub), {
        ...env,
        DIRECTORY_LIMITER: { limit: async () => ({ success: false }) },
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await handler(
        new Request(`https://himmah.test/api/organizations/${org}/learning`),
        env,
      )
    ).status,
    401,
  );
});

test("deleting optional activity/session context preserves learning items, published questions and attempts", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const org = crypto.randomUUID(),
      activity = crypto.randomUUID(),
      session = crypto.randomUUID(),
      item = crypto.randomUUID();
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Community','learn-context','UTC','owner',gen_random_uuid())",
      [org],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')",
      [org],
    );
    await db.query(
      "insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key)values($1,$2,'Context','','','UTC','owner',gen_random_uuid())",
      [activity, org],
    );
    await db.query(
      "insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Context','','','UTC','2099-01-01 12:00Z','2099-01-01 13:00Z','owner',gen_random_uuid())",
      [session, org, activity],
    );
    await db.query("select hub_learning_staff($1,$2,$3,gen_random_uuid(),$4)", [
      "owner",
      org,
      item,
      { action: "create", content, activity, session },
    ]);
    await db.query("select hub_learning_staff($1,$2,$3,gen_random_uuid(),$4)", [
      "owner",
      org,
      item,
      { action: "publish", version: 1 },
    ]);
    const preview = (
      await db.query<any>(
        "select hub_activity_deletion_preview($1,$2,$3) as value",
        ["owner", org, activity],
      )
    ).rows[0]!.value;
    const deletion = (
      await db.query<any>(
        "select hub_delete_activity($1,$2,$3,$4,$5) as value",
        ["owner", org, activity, crypto.randomUUID(), preview.snapshot],
      )
    ).rows[0]!.value;
    assert.equal(deletion.deleted, true);
    const row = (
      await db.query<any>(
        "select activity_id,session_id,title,current_publication from hub_learning_items where id=$1",
        [item],
      )
    ).rows[0]!;
    assert.equal(row.activity_id, null);
    assert.equal(row.session_id, null);
    assert.equal(row.title, content.title);
    assert.ok(row.current_publication);
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from hub_learning_versions where item_id=$1",
          [item],
        )
      ).rows[0]!.n,
      1,
    );
  } finally {
    await db.close();
  }
});
