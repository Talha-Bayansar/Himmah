import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { peopleApi } from "../src/modules/people/api.ts";
import {
  parseContactCsv,
  mapContactCsv,
} from "../src/modules/people/import-csv.ts";
import {
  importRow,
  importRows,
  importCommand,
  type ImportReview,
} from "../src/modules/people/import-contracts.ts";
const key = () => crypto.randomUUID();
test("CSV parsing handles BOM, UTF-8, quotes, separators, limits and invalid rows", () => {
  const data = parseContactCsv(
    '\uFEFFName;Email;Phone\r\n"Ayşe, Öztürk";AYSE@example.test;+32 (470) 123-456\r\n"Multi\nline";;\r\n',
  );
  assert.equal(data.headers[0], "Name");
  assert.equal(data.rows[0]![0], "Ayşe, Öztürk");
  const mapped = mapContactCsv(data, {
    displayName: 0,
    givenName: -1,
    familyName: -1,
    email: 1,
    phone: 2,
  });
  assert.equal(
    mapped[0]!.value?.methods[0]?.normalizedValue,
    "ayse@example.test",
  );
  assert.equal(mapped[0]!.value?.methods[1]?.normalizedValue, "+32470123456");
  assert.equal(mapped[1]!.error, true);
  assert.equal(parseContactCsv("Name\nAlex\n").rows.length, 1);
  assert.deepEqual(parseContactCsv("Name\n\nAlex\n\nSam").sourceRows, [3, 5]);
  assert.equal(
    parseContactCsv('Name,Email\n"Alex ""Example""",alex@example.test\n')
      .rows[0]![0],
    'Alex "Example"',
  );
  for (const text of [
    'Name,Email\n"Broken,x',
    "Name,Email\nAlex",
    "Name\n",
    "Name\n" + Array(501).fill("Alex").join("\n"),
    "Name\n" + "a".repeat(1024 * 1024),
    "Name\n\uFFFD",
  ])
    assert.throws(() => parseContactCsv(text));
  assert.throws(() =>
    mapContactCsv(data, {
      displayName: 0,
      givenName: 0,
      familyName: -1,
      email: 1,
      phone: 2,
    }),
  );
  assert.equal(
    importRow({ row: 2, givenName: "Alex", familyName: "Example" }).displayName,
    "Alex Example",
  );
  assert.throws(() =>
    importRows([
      { ...importRow({ row: 2, displayName: "Alex" }), actorId: "forged" },
    ]),
  );
  assert.throws(() =>
    importCommand({
      rows: [importRow({ row: 2, displayName: "Alex" })],
      selected: [2, 2],
      snapshot: "a".repeat(32),
      key: key(),
    }),
  );
});
test("contact import SQL/API is reviewed, atomic, scoped, exact-retry safe and independent", async (t) => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect();
    const store = createPeopleStore("", async (query) => {
      const q = dialect.sqlToQuery(query);
      return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
    });
    const org = key(),
      foreign = key();
    for (const [id, actor] of [
      [org, "owner"],
      [foreign, "outsider"],
    ]) {
      await db.query(
        "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Synthetic',$2,'Europe/Brussels',$3,gen_random_uuid())",
        [id, id, actor],
      );
      await db.query(
        "insert into hub_memberships(organization_id,user_id,role)values($1,$2,'owner')",
        [id, actor],
      );
    }
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'volunteer','volunteer')",
      [org],
    );
    const rows = [
      importRow({
        row: 2,
        displayName: "Alex Example",
        email: "SHARED@example.test",
        phone: "+32 (470) 123-456",
      }),
      importRow({ row: 3, givenName: "Sam", familyName: "Example" }),
      importRow({ row: 4, displayName: " alex  example " }),
    ];
    let review = (await store.reviewImport(
      "owner",
      org,
      rows,
    )) as unknown as ImportReview;
    assert.equal(review.rows[0]!.fileMatches[0], 4);
    assert.equal(review.rows[2]!.fileMatches[0], 2);
    assert.equal(review.rows[1]!.matchCount, 0);
    const requestKey = key();
    const command = {
      key: requestKey,
      rows,
      selected: [2, 3],
      snapshot: review.snapshot,
    };
    await t.test(
      "explicit selected rows create canonical contacts and methods with audited atomic receipt",
      async () => {
        assert.deepEqual(await store.importContacts("owner", org, command), {
          created: 2,
          skipped: 1,
        });
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from himmah.people_audit_events",
            )
          ).rows[0]!.n,
          2,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from himmah.contact_methods",
            )
          ).rows[0]!.n,
          2,
        );
        assert.deepEqual(await store.importContacts("owner", org, command), {
          created: 2,
          skipped: 1,
          replayed: true,
        });
        assert.equal(
          (
            await store.importContacts("owner", org, {
              ...command,
              selected: [2],
            })
          )?.code,
          "request_key_conflict",
        );
        const counts = (
          await db.query<{ n: number }>(
            "select (select count(*) from hub_attendance)+(select count(*) from hub_cash_receipts)+(select count(*) from hub_memberships where user_id not in('owner','outsider','volunteer')) as n",
          )
        ).rows[0]!.n;
        assert.equal(Number(counts), 0);
      },
    );
    await t.test(
      "existing active/archived contacts and shared methods are suggestions, never merged",
      async () => {
        const contact = (
          await db.query<{ id: string }>(
            "select id from himmah.contacts where display_name='Alex Example'",
          )
        ).rows[0]!.id;
        await store.command("owner", org, "archive", key(), {
          contactId: contact,
          version: 1,
        });
        const next = [
          importRow({
            row: 2,
            displayName: "Different name",
            email: "shared@example.test",
          }),
          importRow({ row: 3, displayName: "Alex Example" }),
        ];
        const p = (await store.reviewImport(
          "owner",
          org,
          next,
        )) as unknown as ImportReview;
        assert.equal(p.rows[0]!.matchCount, 1);
        assert.equal(p.rows[0]!.matches[0]!.archived, true);
        assert.equal(p.rows[1]!.matchCount, 1);
        assert.deepEqual(
          await store.importContacts("owner", org, {
            key: key(),
            rows: next,
            selected: [2],
            snapshot: p.snapshot,
          }),
          { created: 1, skipped: 1 },
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from himmah.contacts where display_name='Alex Example'",
            )
          ).rows[0]!.n,
          1,
        );
      },
    );
    await t.test(
      "a concurrent new match invalidates the review before any writes",
      async () => {
        const values = [importRow({ row: 2, displayName: "New person" })];
        const p = (await store.reviewImport(
          "owner",
          org,
          values,
        )) as unknown as ImportReview;
        await store.command("owner", org, "create", key(), {
          displayName: "New person",
          givenName: null,
          familyName: null,
        });
        assert.equal(
          (
            await store.importContacts("owner", org, {
              key: key(),
              rows: values,
              selected: [2],
              snapshot: p.snapshot,
            })
          )?.code,
          "version_conflict",
        );
      },
    );
    await t.test(
      "authorization applies to previews, writes and previously committed retries",
      async () => {
        assert.equal(await store.reviewImport("outsider", org, rows), null);
        assert.equal(await store.reviewImport("volunteer", org, rows), null);
        assert.equal(
          (await store.importContacts("outsider", org, command))?.code,
          "not_found_or_forbidden",
        );
        await db.query(
          "update himmah.staff_memberships set active=false where organization_id=$1 and user_id='owner'",
          [org],
        );
        assert.equal(
          (await store.importContacts("owner", org, command))?.code,
          "not_found_or_forbidden",
        );
        await db.query(
          "update himmah.staff_memberships set active=true where organization_id=$1 and user_id='owner'",
          [org],
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from himmah.contacts where organization_id=$1",
              [foreign],
            )
          ).rows[0]!.n,
          0,
        );
      },
    );
    await t.test(
      "audit failure rolls back every contact/method and the command receipt",
      async () => {
        const values = [
          importRow({ row: 2, displayName: "Rollback one" }),
          importRow({
            row: 3,
            displayName: "Rollback two",
            email: "rollback@example.test",
          }),
        ];
        const p = (await store.reviewImport(
          "owner",
          org,
          values,
        )) as unknown as ImportReview;
        await db.exec(
          "create function fail_import_audit() returns trigger language plpgsql as $$ begin if (select display_name from himmah.contacts where id=NEW.contact_id)='Rollback two' then raise exception 'synthetic failure';end if;return NEW;end $$; create trigger fail_import_audit before insert on himmah.people_audit_events for each row execute function fail_import_audit();",
        );
        const k = key();
        await assert.rejects(() =>
          store.importContacts("owner", org, {
            key: k,
            rows: values,
            selected: [2, 3],
            snapshot: p.snapshot,
          }),
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from himmah.contacts where display_name like 'Rollback%'",
            )
          ).rows[0]!.n,
          0,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from himmah.contact_import_receipts where request_key=$1",
              [k],
            )
          ).rows[0]!.n,
          0,
        );
        await db.exec(
          "drop trigger fail_import_audit on himmah.people_audit_events",
        );
      },
    );
    await t.test(
      "API rejects forged actors, invalid bodies, oversized imports and unverified users",
      async () => {
        const call = (body: unknown, verified = true) =>
          peopleApi(
            new Request(
              `https://himmah.test/api/organizations/${org}/people/contact-import/review`,
              { method: "POST", body: JSON.stringify(body) },
            ),
            { id: "owner", emailVerified: verified },
            store,
          );
        assert.equal((await call({ rows })).status, 200);
        assert.equal((await call({ rows }, false)).status, 403);
        assert.equal(
          (await call({ rows: [{ ...rows[0], actorId: "outsider" }] })).status,
          400,
        );
        assert.equal(
          (await call({ rows: Array(501).fill(rows[0]) })).status,
          400,
        );
        assert.equal(
          (await call({ rows })).headers.get("cache-control"),
          "no-store",
        );
      },
    );
  } finally {
    await db.close();
  }
});
test("500-row duplicate reviews have bounded suggestions and validate direct SQL inputs", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const org = key();
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Synthetic','synthetic','UTC','owner',gen_random_uuid())",
      [org],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')",
      [org],
    );
    const rows = Array.from({ length: 500 }, (_, i) =>
      importRow({ row: i + 2, displayName: "Same person" }),
    );
    const review = (
      await db.query<{ result: ImportReview }>(
        "select himmah.contact_import_review('owner',$1,$2::jsonb) result",
        [org, JSON.stringify(rows)],
      )
    ).rows[0]!.result;
    assert.equal(review.rows.length, 500);
    assert.equal(review.rows[0]!.fileMatches.length, 5);
    assert.equal(review.rows[0]!.fileMatchCount, 499);
    assert.ok(JSON.stringify(review).length < 100000);
    for (const raw of [
      null,
      {},
      [],
      [{ row: "forged", displayName: "Alex", methods: [] }],
      [
        {
          row: 2,
          displayName: "Alex",
          methods: [
            {
              kind: "phone",
              value: "bad",
              normalizedValue: "+32470123456",
              preferred: false,
            },
          ],
        },
      ],
    ]) {
      let valid = false;
      try {
        valid = (
          await db.query<{ valid: boolean }>(
            "select himmah.contact_import_rows_valid($1::jsonb) valid",
            [JSON.stringify(raw)],
          )
        ).rows[0]!.valid;
      } catch {
        /* malformed casts fail closed before any write */
      }
      assert.notEqual(valid, true);
    }
  } finally {
    await db.close();
  }
});
test("additive import upgrade preserves the previous contact/method/audit rows", async () => {
  const { contactImportPlan } =
    await import("../scripts/contact-import-plan.mjs");
  const db = new PGlite();
  try {
    await installDatabase(db, { contactImport: false });
    const org = key();
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Synthetic','synthetic','UTC','owner',gen_random_uuid())",
      [org],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')",
      [org],
    );
    await db.query(
      "select himmah.contact_command('owner',$1,'create',gen_random_uuid(),'{\"displayName\":\"Existing person\"}')",
      [org],
    );
    const before = (
      await db.query("select to_jsonb(c) value from himmah.contacts c")
    ).rows;
    const plan = await contactImportPlan();
    await db.exec("BEGIN");
    for (const sql of plan.statements.slice(1)) await db.exec(sql);
    await db.exec("COMMIT");
    assert.deepEqual(
      (await db.query("select to_jsonb(c) value from himmah.contacts c")).rows,
      before,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from himmah.contact_import_receipts",
        )
      ).rows[0]!.n,
      0,
    );
  } finally {
    await db.close();
  }
});
test("import uses the existing Worker origin, JSON, verification and People gates", async () => {
  const { createHandler } = await import("../src/server/worker.ts");
  const org = key();
  let calls = 0,
    verified = true;
  const handler = createHandler({
    store: () => {
      throw Error("Import must use the People route");
    },
    fetch: async () =>
      Response.json({ user: { id: "owner", emailVerified: verified } }),
    people: () =>
      ({
        context: async () => ({ id: org, name: "Synthetic" }),
        reviewImport: async () => {
          calls++;
          return { snapshot: "a".repeat(32), rows: [] };
        },
      }) as never,
  });
  const env = {
    HIMMAH_DATABASE_URL: "isolated",
    HIMMAH_AUTH_URL: "https://auth.invalid",
    HIMMAH_APP_ORIGIN: "https://himmah.test",
    HIMMAH_PEOPLE_ENABLED: "true",
    ASSETS: { fetch: async () => new Response("asset") },
    ONBOARDING_LIMITER: { limit: async () => ({ success: true }) },
    DIRECTORY_LIMITER: { limit: async () => ({ success: true }) },
  };
  const req = (origin = "https://himmah.test", type = "application/json") =>
    new Request(
      `https://himmah.test/api/organizations/${org}/people/contact-import/review`,
      {
        method: "POST",
        headers: { cookie: "session=fixture", origin, "content-type": type },
        body: JSON.stringify({
          rows: [importRow({ row: 2, displayName: "Synthetic" })],
        }),
      },
    );
  assert.equal(
    (await handler(req("https://foreign.invalid"), env)).status,
    403,
  );
  assert.equal(
    (await handler(req("https://himmah.test", "text/plain"), env)).status,
    415,
  );
  assert.equal(
    (await handler(req(), { ...env, HIMMAH_PEOPLE_ENABLED: "false" })).status,
    503,
  );
  verified = false;
  assert.equal((await handler(req(), env)).status, 403);
  assert.equal(calls, 0);
  verified = true;
  assert.equal((await handler(req(), env)).status, 200);
  assert.equal(calls, 1);
});
