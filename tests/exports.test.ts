import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createStore } from "../src/server/store.ts";
import { createExportStore } from "../src/server/export-store.ts";
import { exportApi } from "../src/server/export-api.ts";
import {
  exportFilters,
  exportKinds,
  exportParams,
  EXPORT_ROWS,
  type ExportSnapshot,
} from "../src/exports/contracts.ts";
import { exportCsv, spreadsheetText } from "../src/exports/csv.ts";
const key = () => crypto.randomUUID();
test("export filters are bounded, explicit and reject injected scope/locale/cursor", () => {
  const f = exportFilters(
    { kind: "attendance", from: "2020-03-30", to: "2020-03-31" },
    "Europe/Brussels",
  );
  assert.equal(f.kind, "attendance");
  for (const patch of [
    { kind: "sql" },
    { locale: "forged" },
    { from: "2020-02-30" },
    { from: "2020-03-31", to: "2020-03-30" },
    { from: "2020-01-01", to: "2022-01-01" },
    { group: "forged" },
    { actor: "other" },
    { cursor: "next" },
    { q: "secret" },
    { state: "archived" },
    { session: key() },
    { kind: "insights-summary", activity: key(), session: key() },
  ])
    assert.throws(() => exportFilters({ ...f, ...patch }, "UTC"));
  assert.throws(() =>
    exportFilters({ ...f, kind: "contacts", activity: key() }, "UTC"),
  );
});
test("CSV text is formula-safe, quoted and Unicode-preserving while money remains exact numeric data", () => {
  for (const value of [
    "=1+1",
    " +1",
    '\t=HYPERLINK("x")',
    "\r@SUM(1)",
    "\n-1",
    "\u200b=1",
    "＝1",
  ])
    assert.ok(spreadsheetText(value).startsWith("'"));
  assert.equal(spreadsheetText('Ayşe, "Example"'), 'Ayşe, "Example"');
  const base: ExportSnapshot = {
    organizationName: "=Example Org",
    timezone: "Europe/Brussels",
    activityName: null,
    groupName: null,
    sessionName: null,
    generatedAt: "2026-11-04T12:00:00.000Z",
    items: [
      {
        id: key(),
        name: ' =HYPERLINK("x")',
        givenName: "Ayşe",
        familyName: "O’Example",
        email: "a@example.test",
        phone: "+32470123456",
        archived: false,
        groupCount: 0,
        createdAt: "2026-11-04T00:00:00Z",
      },
    ],
  };
  for (const locale of ["en", "nl", "tr"] as const) {
    const f = exportFilters({ locale }, "Europe/Brussels");
    const result = exportCsv(base, f);
    assert.equal(result.csv[0], "\ufeff");
    assert.ok(result.csv.includes("\r\n"));
    const parsed = Papa.parse<string[]>(result.csv).data;
    assert.equal(parsed.length, 2);
    assert.ok(parsed[1]![1]!.startsWith("'"));
    assert.equal(parsed[1]![4], "a@example.test");
    assert.equal(parsed[1]![5], "'+32470123456");
    assert.equal(parsed[1]![2], "Ayşe");
    assert.equal(result.rowCount, 1);
  }
  const paid = exportCsv(
    {
      ...base,
      items: [
        {
          name: "A",
          chargedMinor: "123456789012345678",
          paidMinor: "123456789012345677",
          outstandingMinor: "1",
        },
      ],
    },
    exportFilters({ kind: "balances" }, "UTC"),
  );
  assert.ok(paid.csv.includes('"1234567890123456.78"'));
  assert.ok(paid.csv.includes('"0.01"'));
  assert.ok(!paid.csv.includes("'1234567890123456.78"));
  assert.throws(
    () => exportCsv({ ...base, tooLarge: true }, exportFilters({}, "UTC")),
    /export_limit/,
  );
  assert.throws(
    () =>
      exportCsv(
        { ...base, items: Array(EXPORT_ROWS + 1).fill(base.items[0]) },
        exportFilters({}, "UTC"),
      ),
    /export_limit/,
  );
  assert.throws(
    () =>
      exportCsv(
        {
          ...base,
          items: [{ ...base.items[0], name: "X".repeat(8 * 1024 * 1024) }],
        },
        exportFilters({}, "UTC"),
      ),
    /export_limit/,
  );
});
test("export SQL/API enforce tenant/admin scope, snapshot semantics, bounds and private file headers", async (t) => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect();
    const run = async (s: any) => {
      const q = dialect.sqlToQuery(s);
      return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
    };
    const store = createExportStore("", run),
      organizations = createStore("", run),
      org = key(),
      foreign = key(),
      group = key(),
      activity = key(),
      session = key(),
      cancelled = key(),
      future = key(),
      contacts = [key(), key()];
    for (const [id, actor, slug] of [
      [org, "owner", "exports"],
      [foreign, "outsider", "foreign-exports"],
    ]) {
      await db.query(
        "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Synthetic',$2,'Europe/Brussels',$3,gen_random_uuid())",
        [id, slug, actor],
      );
      await db.query(
        "insert into hub_memberships(organization_id,user_id,role,display_name)values($1,$2,'owner','Synthetic Owner')",
        [id, actor],
      );
    }
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'helper','volunteer'),($1,'admin','admin')",
      [org],
    );
    for (const [id, name] of [
      [contacts[0], "=Synthetic formula"],
      [contacts[1], 'Omar, "Example"'],
    ])
      await db.query(
        "insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,$3,'owner','owner')",
        [id, org, name],
      );
    await db.query(
      "insert into himmah.contact_methods(organization_id,contact_id,kind,value,normalized_value,preferred,created_by,updated_by,created_at)values($1,$2,'email','old@example.test','old@example.test',false,'owner','owner','2020-01-01'),($1,$2,'email','Primary@Example.test','primary@example.test',true,'owner','owner','2021-01-01'),($1,$2,'phone','+32470123456','+32470123456',false,'owner','owner','2020-01-01')",
      [org, contacts[0]],
    );
    await db.query(
      "insert into himmah.groups(id,organization_id,name,created_by,updated_by)values($1,$2,'Historical group','owner','owner')",
      [group, org],
    );
    await db.query(
      "insert into himmah.group_memberships(organization_id,group_id,contact_id,valid_from,valid_to,created_by,updated_by)values($1,$2,$3,'2019-01-01','2021-01-01','owner','owner')",
      [org, group, contacts[0]],
    );
    await db.query(
      "update himmah.contacts set archived_at=now(),archived_by='owner' where id=$1",
      [contacts[1]],
    );
    await db.query(
      "insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key)values($1,$2,'Synthetic activity','','','Europe/Brussels','owner',gen_random_uuid())",
      [activity, org],
    );
    for (const [id, start, isCancelled] of [
      [session, "2020-03-29T22:30:00Z", false],
      [cancelled, "2020-03-30T12:00:00Z", true],
      [future, "2099-01-01T12:00:00Z", false],
    ]) {
      await db.query(
        "insert into hub_activity_sessions(id,organization_id,activity_id,name,topic,description,location,timezone,starts_at,ends_at,cancelled,created_by,creation_key)values($1,$2,$3,'Synthetic','A topic','','','Europe/Brussels',$4::timestamptz,$4::timestamptz+interval '1 hour',$5,'owner',gen_random_uuid())",
        [id, org, activity, start, isCancelled],
      );
      await db.query(
        "insert into hub_attendance(organization_id,activity_id,session_id,person_id,status)values($1,$2,$3,$4,'present')",
        [org, activity, id, contacts[0]],
      );
    }
    const f = exportFilters(
      { kind: "attendance", from: "2020-03-30", to: "2020-03-31" },
      "Europe/Brussels",
    );
    const api = (
      filters = f,
      actor = "owner",
      verified = true,
      method = "GET",
      extra = "",
    ) =>
      exportApi(
        new Request(
          `https://himmah.test/api/organizations/${org}/exports?${exportParams(filters)}${extra}`,
          { method },
        ),
        { id: actor, emailVerified: verified },
        organizations,
        store,
      );
    await t.test(
      "contacts use current memberships and preferred active methods; archived state and literal search are explicit",
      async () => {
        const c = await store.data("owner", org, { ...f, kind: "contacts" });
        assert.equal(c!.items.length, 1);
        assert.equal(c!.items[0]!.email, "Primary@Example.test");
        assert.equal(c!.items[0]!.phone, "+32470123456");
        assert.equal(
          (await store.data("owner", org, {
            ...f,
            kind: "contacts",
            state: "all",
          }))!.items.length,
          2,
        );
        assert.equal(
          (await store.data("owner", org, {
            ...f,
            kind: "contacts",
            state: "archived",
          }))!.items.length,
          1,
        );
        assert.equal(
          (await store.data("owner", org, { ...f, kind: "contacts", group }))!
            .items.length,
          0,
        );
        assert.equal(
          (await store.data("owner", org, { ...f, kind: "contacts", q: "%" }))!
            .items.length,
          0,
        );
      },
    );
    await t.test(
      "attendance is factual and date-local; exact-session rosters also preserve cancelled/future presence without charging it",
      async () => {
        const a = await store.data("owner", org, f);
        assert.equal(a!.items.length, 1);
        assert.equal(a!.items[0]!.localStart, "2020-03-30T00:30:00");
        assert.equal(a!.items[0]!.chargedMinor, null);
        assert.equal(
          (await store.data("owner", org, { ...f, group }))!.items.length,
          1,
        );
        for (const id of [cancelled, future]) {
          const exact = await store.data("owner", org, {
            ...f,
            activity,
            session: id,
          });
          assert.equal(exact!.items.length, 1);
          const result = exportCsv(exact!, { ...f, activity, session: id });
          assert.ok(result.csv.includes("No recorded charge"));
        }
      },
    );
    await t.test(
      "every report and locale produces a complete private CSV or header-only empty file",
      async () => {
        for (const kind of exportKinds)
          for (const locale of ["en", "nl", "tr"] as const) {
            const response = await api({ ...f, kind, locale });
            assert.equal(response!.status, 200, kind + locale);
            assert.match(response!.headers.get("content-type")!, /^text\/csv/);
            assert.match(response!.headers.get("cache-control")!, /no-store/);
            assert.match(
              response!.headers.get("content-disposition")!,
              /^attachment; filename="himmah-/,
            );
            assert.equal(
              response!.headers.get("x-content-type-options"),
              "nosniff",
            );
            assert.equal(response!.headers.get("content-language"), locale);
            const csv = await response!.text();
            const records = Papa.parse<string[]>(csv, {
              skipEmptyLines: true,
            }).data;
            assert.equal(
              records.length - 1,
              Number(response!.headers.get("x-himmah-export-rows")),
            );
            assert.ok(!csv.includes("neon_auth"));
          }
      },
    );
    await t.test(
      "SQL independently rejects volunteers, foreign tenants and foreign target IDs",
      async () => {
        for (const kind of exportKinds) {
          assert.equal(
            await store.data("helper", org, { ...f, kind }),
            undefined,
          );
          assert.equal(
            await store.data("outsider", org, { ...f, kind }),
            undefined,
          );
          assert.equal(
            await store.data("owner", foreign, { ...f, kind }),
            undefined,
          );
          assert.equal(
            await store.context("helper", org, { ...f, kind }),
            undefined,
          );
        }
        assert.equal(
          await store.data("owner", org, { ...f, group: foreign }),
          undefined,
        );
        assert.equal(
          await store.context("owner", org, {
            ...f,
            activity,
            session: foreign,
          }),
          undefined,
        );
        assert.equal((await api(f, "helper"))!.status, 403);
        assert.equal((await api(f, "owner", false))!.status, 403);
        assert.equal((await api(f, "owner", true, "POST"))!.status, 404);
        assert.equal(
          (await api(f, "owner", true, "GET", "&locale=tr&locale=en"))!.status,
          400,
        );
      },
    );
    await t.test(
      "row limits reject the whole export instead of returning a partial file; narrower filters recover",
      async () => {
        await db.query(
          "insert into himmah.contacts(organization_id,display_name,created_by,updated_by)select $1,'Bulk '||n,'owner','owner' from generate_series(1,10001)n",
          [org],
        );
        const large = await store.data("owner", org, {
          ...f,
          kind: "contacts",
        });
        assert.equal(large!.tooLarge, true);
        assert.deepEqual(large!.items, []);
        const response = await api({ ...f, kind: "contacts" });
        assert.equal(response!.status, 413);
        assert.equal((await response!.json()).code, "export_limit");
        assert.equal(
          (await api({ ...f, kind: "contacts", q: "Synthetic formula" }))!
            .status,
          200,
        );
      },
    );
    await t.test(
      "revocation denies metadata and downloads after an earlier successful read",
      async () => {
        await db.query(
          "update hub_memberships set role='volunteer' where organization_id=$1 and user_id='admin'",
          [org],
        );
        assert.equal(await store.context("admin", org, f), undefined);
        assert.equal((await api(f, "admin"))!.status, 403);
      },
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from hub_registration_charges",
        )
      ).rows[0]!.n,
      0,
      "exports never create charges",
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from hub_cash_receipts",
        )
      ).rows[0]!.n,
      0,
    );
  } finally {
    await db.close();
  }
});
test("Worker routes exports through current authentication, verification, People gate and rate limits", async () => {
  const { createHandler } = await import("../src/server/worker.ts");
  let verified = true,
    signed = true,
    allowed = true,
    calls = 0;
  const org = key();
  const handler = createHandler({
    fetch: async () =>
      Response.json({
        user: signed ? { id: "owner", emailVerified: verified } : null,
      }),
    store: () =>
      ({
        get: async () => ({ id: org, role: "owner", timezone: "UTC" }),
      }) as never,
    exports: () => ({
      context: async () => {
        calls++;
        return {
          organizationName: "Synthetic",
          timezone: "UTC",
          activityName: null,
          groupName: null,
          sessionName: null,
        };
      },
      data: async () => {
        calls++;
        return {
          organizationName: "Synthetic",
          timezone: "UTC",
          activityName: null,
          groupName: null,
          sessionName: null,
          generatedAt: "2026-11-04T00:00:00.000Z",
          items: [],
        };
      },
    }),
  });
  const env = {
    HIMMAH_DATABASE_URL: "isolated",
    HIMMAH_APP_ORIGIN: "https://himmah.test",
    HIMMAH_AUTH_URL: "https://auth.invalid",
    HIMMAH_PEOPLE_ENABLED: "true",
    ASSETS: { fetch: async () => new Response("asset") },
    ONBOARDING_LIMITER: { limit: async () => ({ success: true }) },
    DIRECTORY_LIMITER: { limit: async () => ({ success: allowed }) },
  };
  const request = (suffix = "context") =>
    new Request(
      `https://himmah.test/api/organizations/${org}/exports${suffix ? "/" + suffix : ""}`,
      { headers: { cookie: "session=fixture" } },
    );
  assert.equal((await handler(request(), env)).status, 200);
  assert.equal(calls, 1);
  assert.equal(
    (await handler(request(), { ...env, HIMMAH_PEOPLE_ENABLED: "false" }))
      .status,
    503,
  );
  allowed = false;
  assert.equal((await handler(request(), env)).status, 429);
  allowed = true;
  verified = false;
  assert.equal((await handler(request(), env)).status, 403);
  signed = false;
  assert.equal((await handler(request(), env)).status, 401);
  assert.equal(calls, 1);
  signed = true;
  verified = true;
  const csv = await handler(request(""), env);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type")!, /^text\/csv/);
  assert.equal(calls, 2);
});
