import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { peopleApi } from "../src/modules/people/api.ts";
import { contactInput, methodInput } from "../src/modules/people/contracts.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
test("People inputs accept name-only contacts and validate direct methods without an age/account requirement", () => {
  assert.deepEqual(contactInput({ displayName: "  İbrahim  " }), {
    displayName: "İbrahim",
    givenName: null,
    familyName: null,
  });
  assert.throws(() => contactInput({ displayName: "\u0000" }));
  assert.throws(() =>
    methodInput({ kind: "phone", value: "0412345678", preferred: false }),
  );
  assert.equal(
    methodInput({
      kind: "phone",
      value: "+32 (412) 34-56-78",
      preferred: false,
    }).normalizedValue,
    "+32412345678",
  );
  assert.equal(
    methodInput({
      kind: "email",
      value: "Example@Example.test",
      preferred: true,
    }).normalizedValue,
    "example@example.test",
  );
});
test("People baseline and actual API/SQL: tenant boundaries, retry receipts, corrections, archive and rollback", async (t) => {
  const db = new PGlite();
  try {
    for (const file of (await readdir("db/rebuild/generated"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile("db/rebuild/generated/" + file, "utf8"));
    await db.exec(await readFile("db/rebuild/contacts.sql", "utf8"));
    await db.exec(await readFile("db/rebuild/directory.sql", "utf8"));
    await db.exec(await readFile("db/rebuild/communication.sql", "utf8"));
    await db.query(
      `insert into himmah.organizations(id,name,created_by,updated_by) values ($1,'A','owner','owner'),($2,'B','other','other')`,
      [org, other],
    );
    await db.query(
      `insert into himmah.staff_memberships(organization_id,user_id,role,created_by,updated_by) values ($1,'owner','owner','owner','owner'),($1,'volunteer','volunteer','owner','owner'),($2,'other','owner','other','other')`,
      [org, other],
    );
    const dialect = new PgDialect();
    const store = createPeopleStore("", async (statement) => {
      const q = dialect.sqlToQuery(statement);
      return (await db.query(q.sql, q.params)).rows as Record<
        string,
        unknown
      >[];
    });
    const api = (
      path = "",
      method = "GET",
      body?: Record<string, unknown>,
      user = "owner",
      tenant = org,
    ) =>
      peopleApi(
        new Request(
          `https://himmah.test/api/organizations/${tenant}/people/contacts${path}`,
          { method, ...(body ? { body: JSON.stringify(body) } : {}) },
        ),
        { id: user, emailVerified: true },
        store,
      );
    const createKey = crypto.randomUUID();
    let id = "";
    await t.test(
      "name-only creation, duplicate names and exact retries",
      async () => {
        const body = { displayName: "Same name", requestKey: createKey };
        const first = await api("", "POST", body);
        assert.equal(first.status, 200);
        id = (await first.json()).id;
        const repeat = await api("", "POST", body);
        assert.equal((await repeat.json()).id, id);
        assert.equal(
          (await db.query("select * from himmah.contacts")).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from himmah.people_audit_events")).rows
            .length,
          1,
        );
        assert.equal(
          (await api("", "POST", { ...body, displayName: "Changed" })).status,
          409,
        );
        assert.equal(
          (await api("", "POST", { ...body, requestKey: crypto.randomUUID() }))
            .status,
          200,
        );
      },
    );
    await t.test(
      "cross-tenant/volunteer reads, writes and retries are denied",
      async () => {
        for (const user of ["volunteer", "other"]) {
          assert.equal((await api("", "GET", undefined, user)).status, 404);
          assert.equal(
            (await api("/" + id, "GET", undefined, user)).status,
            404,
          );
          assert.equal(
            (
              await api(
                "",
                "POST",
                { displayName: "Same name", requestKey: createKey },
                user,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await store.command(user, org, "create", crypto.randomUUID(), {
                displayName: "No",
              })
            ).code,
            "not_found_or_forbidden",
          );
        }
        assert.equal(
          (await api("/" + id, "GET", undefined, "other", other)).status,
          404,
        );
      },
    );
    await t.test(
      "paginated search cursors are tenant/filter scoped",
      async () => {
        for (let n = 0; n < 53; n++)
          await api("", "POST", {
            displayName: "Contact " + n,
            requestKey: crypto.randomUUID(),
          });
        const first = await (await api("?limit=25")).json();
        assert.equal(first.items.length, 25);
        assert.ok(first.nextCursor);
        const second = await (
          await api("?limit=25&cursor=" + first.nextCursor)
        ).json();
        assert.equal(second.items.length, 25);
        assert.equal(
          new Set([...first.items, ...second.items].map((x) => x.id)).size,
          50,
        );
        assert.equal(
          (await api("?q=different&cursor=" + first.nextCursor)).status,
          400,
        );
        assert.equal((await api("?limit=51")).status, 400);
      },
    );
    await t.test(
      "version checks and separate preferred direct methods preserve history",
      async () => {
        assert.equal(
          (
            await api("/" + id, "PATCH", {
              displayName: "Updated",
              version: 1,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await api("/" + id, "PATCH", {
              displayName: "Stale",
              version: 1,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          409,
        );
        const add = {
          kind: "email",
          value: "a@example.test",
          preferred: true,
          version: 2,
          requestKey: crypto.randomUUID(),
        };
        assert.equal(
          (await api("/" + id + "/methods", "POST", add)).status,
          200,
        );
        assert.equal(
          (await api("/" + id + "/methods", "POST", add)).status,
          200,
        );
        assert.equal(
          (
            await api("/" + id + "/methods", "POST", {
              ...add,
              version: 3,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          409,
        );
        // Failed duplicate insertion must roll back the preferred-flag change and version bump.
        let methods = await (await api("/" + id + "/methods")).json();
        assert.equal(methods.items.length, 1);
        assert.equal(methods.items[0].preferred, true);
        assert.equal(
          (
            await api("/" + id + "/methods", "POST", {
              ...add,
              value: "b@example.test",
              version: 3,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          200,
        );
        methods = await (await api("/" + id + "/methods")).json();
        assert.equal(
          methods.items.filter((x: { preferred: boolean }) => x.preferred)
            .length,
          1,
        );
        const a = methods.items.find(
          (x: { value: string; preferred: boolean }) =>
            x.value === "a@example.test",
        );
        assert.equal(a.preferred, false);
        assert.equal(
          (
            await api("/" + id + "/methods/" + a.id, "DELETE", {
              version: 4,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await db.query(
              "select * from himmah.contact_methods where ended_at is not null",
            )
          ).rows.length,
          1,
        );
        const history = await (await api("/" + id + "/history")).json();
        assert.ok(history.items.length >= 5);
        assert.equal(JSON.stringify(history).includes("@example"), false);
      },
    );
    await t.test(
      "method replacement is atomic, retry-safe and retains the old value as ended history",
      async () => {
        const version = (await (await api("/" + id)).json()).version;
        const method = (await (await api("/" + id + "/methods")).json())
          .items[0];
        const payload = {
          kind: "email",
          value: "new@example.test",
          preferred: true,
          version,
          requestKey: crypto.randomUUID(),
        };
        assert.equal(
          (await api("/" + id + "/methods/" + method.id, "PATCH", payload))
            .status,
          200,
        );
        assert.equal(
          (await api("/" + id + "/methods/" + method.id, "PATCH", payload))
            .status,
          200,
        );
        const current = (await (await api("/" + id + "/methods")).json()).items;
        assert.equal(current.length, 1);
        assert.equal(current[0].value, "new@example.test");
        assert.equal(
          (
            await db.query(
              "select * from himmah.contact_methods where id=$1 and ended_at is not null",
              [method.id],
            )
          ).rows.length,
          1,
        );
      },
    );
    await t.test(
      "archive hides active list entries, blocks edits and preserves details until restored",
      async () => {
        const version = (await (await api("/" + id)).json()).version;
        assert.equal(
          (
            await api("/" + id + "/archive", "POST", {
              version,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          200,
        );
        assert.ok((await (await api("/" + id)).json()).archivedAt);
        assert.equal(
          (
            await api("/" + id, "PATCH", {
              displayName: "No",
              version: version + 1,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          409,
        );
        assert.equal(
          (await (await api("?archived=true")).json()).items.length,
          1,
        );
        assert.equal(
          (
            await api("/" + id + "/restore", "POST", {
              version: version + 1,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "audit failure rolls back contact mutation and receipt",
      async () => {
        await db.exec(
          `create function himmah.fail_audit() returns trigger language plpgsql as $$ begin raise exception 'injected failure'; end $$; create trigger fail_audit before insert on himmah.people_audit_events for each row execute function himmah.fail_audit();`,
        );
        const before = (
          await db.query<{ count: number }>(
            "select count(*)::int as count from himmah.contacts",
          )
        ).rows[0]!.count;
        assert.equal(
          (
            await api("", "POST", {
              displayName: "Rollback",
              requestKey: crypto.randomUUID(),
            })
          ).status,
          503,
        );
        assert.equal(
          (
            await db.query<{ count: number }>(
              "select count(*)::int as count from himmah.contacts",
            )
          ).rows[0]!.count,
          before,
        );
        await db.exec("drop trigger fail_audit on himmah.people_audit_events");
      },
    );
    await t.test(
      "revocation denies reads and exact receipt retries",
      async () => {
        await db.exec(
          `update himmah.staff_memberships set active=false where user_id='owner'`,
        );
        assert.equal((await api("", "GET")).status, 404);
        assert.equal(
          (
            await api("", "POST", {
              displayName: "Same name",
              requestKey: createKey,
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await store.command("owner", org, "create", createKey, {
              displayName: "Same name",
              givenName: null,
              familyName: null,
            })
          ).code,
          "not_found_or_forbidden",
        );
      },
    );
  } finally {
    await db.close();
  }
});

test("Worker keeps rebuild endpoints disabled by default and enforces origin/verification before writes", async () => {
  const { createHandler } = await import("../src/server/worker.ts");
  const user = {
    id: "owner",
    name: "Owner",
    email: "owner@example.test",
    emailVerified: true,
  };
  const env = {
    HIMMAH_DATABASE_URL: "unused-fixture",
    HIMMAH_AUTH_URL: "https://auth.invalid",
    HIMMAH_APP_ORIGIN: "https://himmah.test",
    ASSETS: { fetch: async () => new Response("asset") },
    ONBOARDING_LIMITER: { limit: async () => ({ success: true }) },
  };
  const handler = createHandler({
    fetch: async () => Response.json({ user }),
    store: () => {
      throw Error("Legacy store must not run");
    },
    people: () =>
      ({ context: async () => ({ id: org, name: "Test" }) }) as never,
  });
  const request = (method = "GET", origin = "https://himmah.test") =>
    new Request(`https://himmah.test/api/organizations/${org}/people/context`, {
      method,
      headers: {
        cookie: "session=fixture",
        origin,
        "content-type": "application/json",
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
  assert.equal((await handler(request(), env)).status, 503);
  assert.equal(
    (await handler(request(), { ...env, HIMMAH_PEOPLE_ENABLED: "true" }))
      .status,
    200,
  );
  assert.equal(
    (
      await handler(request("POST", "https://other.invalid"), {
        ...env,
        HIMMAH_PEOPLE_ENABLED: "true",
      })
    ).status,
    403,
  );
  const response = await handler(request(), {
    ...env,
    HIMMAH_PEOPLE_ENABLED: "true",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
