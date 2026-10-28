import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { peopleApi } from "../src/modules/people/api.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
test("Communication SQL/API resolves explicit responsibilities, global priorities and tenant-safe audited commands", async (t) => {
  const db = new PGlite();
  try {
    for (const file of (await readdir("db/migrations/generated"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile("db/migrations/generated/" + file, "utf8"));
    for (const file of ["contacts", "directory", "communication"])
      await db.exec(await readFile("db/rebuild/" + file + ".sql", "utf8"));
    await db.query(
      `insert into himmah.organizations(id,name,created_by,updated_by) values($1,'One','owner','owner'),($2,'Other','other','other')`,
      [org, other],
    );
    await db.query(
      `insert into himmah.staff_memberships(organization_id,user_id,role,created_by,updated_by) values($1,'owner','owner','owner','owner'),($1,'volunteer','volunteer','owner','owner'),($2,'other','owner','other','other')`,
      [org, other],
    );
    const dialect = new PgDialect(),
      store = createPeopleStore("", async (statement) => {
        const q = dialect.sqlToQuery(statement);
        return (await db.query(q.sql, q.params)).rows as Record<
          string,
          unknown
        >[];
      });
    const api = (
      path: string,
      method = "GET",
      body?: Record<string, unknown>,
      user = "owner",
      tenant = org,
    ) =>
      peopleApi(
        new Request(
          "https://himmah.test/api/organizations/" + tenant + "/people/" + path,
          { method, ...(body ? { body: JSON.stringify(body) } : {}) },
        ),
        { id: user, emailVerified: true },
        store,
      );
    const write = async (
      path: string,
      method: string,
      body: Record<string, unknown>,
    ) => {
      const r = await api(path, method, {
        requestKey: crypto.randomUUID(),
        ...body,
      });
      assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
      return r.json();
    };
    const create = async (name: string) =>
      (await write("contacts", "POST", { displayName: name })).id as string;
    const subject = await create("Subject"),
      responsible = await create("Unrelated contact"),
      missing = await create("Missing channels");
    const get = async (id: string) => (await api("contacts/" + id)).json(),
      route = async () =>
        (await api("contacts/" + subject + "/routing")).json();
    const method = async (
      id: string,
      kind: string,
      value: string,
      preferred = true,
    ) =>
      write("contacts/" + id + "/methods", "POST", {
        version: (await get(id)).version,
        kind,
        value,
        preferred,
      });
    const assign = async (
      id: string,
      priority: number,
      purpose = "routine",
      channel = "any",
    ) =>
      write("contacts/" + subject + "/communication", "POST", {
        version: (await get(subject)).version,
        responsibleContactId: id,
        responsibleVersion: (await get(id)).version,
        priority,
        purpose,
        channel,
      });
    const prefs = async (
      routineDirectAllowed: boolean,
      emergencyDirectAllowed: boolean,
    ) =>
      write("contacts/" + subject + "/communication-preferences", "PATCH", {
        version: (await get(subject)).version,
        routineDirectAllowed,
        emergencyDirectAllowed,
      });
    await t.test(
      "defaults and family links never create a communication assignment",
      async () => {
        const r = await route();
        assert.deepEqual(r.preferences, {
          routineDirectAllowed: true,
          emergencyDirectAllowed: false,
        });
        assert.equal(r.routine.candidates.length, 0);
        assert.equal(r.emergency.total, 0);
        const types = await (await api("relationship-types")).json(),
          father = types.items.find((x: any) => x.code === "father");
        await write("contacts/" + subject + "/relationships", "POST", {
          version: (await get(subject)).version,
          otherContactId: responsible,
          otherVersion: (await get(responsible)).version,
          typeId: father.id,
          typeVersionId: father.typeVersionId,
          direction: "other_is_role",
        });
        await method(responsible, "phone", "+32412345678");
        assert.equal((await route()).routine.total, 0);
      },
    );
    await t.test(
      "missing first priority falls through and channels are enforced",
      async () => {
        await assign(missing, 1);
        await assign(responsible, 2, "routine", "email");
        assert.equal((await route()).routine.candidates.length, 0);
        await method(responsible, "email", "one@example.test");
        let r = await route();
        assert.equal(r.routine.missing, 2);
        assert.equal(r.routine.candidates[0].phone, null);
        assert.equal(r.routine.candidates[0].email, "one@example.test");
        await method(responsible, "email", "preferred@example.test");
        r = await route();
        assert.equal(r.routine.candidates[0].email, "preferred@example.test");
      },
    );
    await t.test(
      "routine direct-first and emergency assignment-first honor separate explicit policies",
      async () => {
        await method(subject, "phone", "+32412345679");
        let r = await route();
        assert.equal(r.routine.candidates[0].direct, true);
        assert.equal(r.emergency.candidates.length, 0);
        await prefs(false, true);
        r = await route();
        assert.equal(r.routine.candidates[0].contactId, responsible);
        assert.equal(r.emergency.candidates[0].direct, true);
        await assign(responsible, 99, "emergency", "phone");
        r = await route();
        assert.equal(r.emergency.candidates[0].direct, false);
        assert.equal(r.emergency.candidates[0].phone, "+32412345678");
      },
    );
    await t.test(
      "recommendation scans beyond page one and discloses equally ranked alternatives",
      async () => {
        for (let i = 0; i < 28; i++) {
          const id = await create("Candidate " + i);
          if (i < 4) await method(id, "phone", "+32412345" + String(100 + i));
          await assign(id, i < 4 ? 1 : 50);
        }
        const r = await route();
        assert.equal(r.routine.alternatives, 4);
        assert.equal(r.routine.candidates.length, 3);
        assert.ok(r.routine.candidates.every((c: any) => c.priority === 1));
        const first = await (
          await api("contacts/" + subject + "/communication?limit=3")
        ).json();
        assert.equal(first.total, 31);
        assert.equal(first.items.length, 3);
        const second = await (
          await api(
            "contacts/" +
              subject +
              "/communication?limit=3&cursor=" +
              encodeURIComponent(first.nextCursor),
          )
        ).json();
        assert.ok(
          second.items.every(
            (x: any) => !first.items.some((y: any) => x.id === y.id),
          ),
        );
        const filtered = await (
          await api("contacts/" + subject + "/communication?q=Unrelated")
        ).json();
        assert.equal(filtered.total, 2);
      },
    );
    await t.test(
      "commands reject self/foreign/stale/invalid/duplicate writes and retry exactly",
      async () => {
        const b = {
          version: (await get(subject)).version,
          responsibleContactId: responsible,
          responsibleVersion: (await get(responsible)).version,
          priority: 5,
          purpose: "routine",
          channel: "phone",
          requestKey: crypto.randomUUID(),
        };
        assert.equal(
          (
            await api("contacts/" + subject + "/communication", "POST", {
              ...b,
              responsibleContactId: subject,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await api("contacts/" + subject + "/communication", "POST", {
              ...b,
              priority: 100,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await api("contacts/" + subject + "/communication", "POST", {
              ...b,
              version: 999,
            })
          ).status,
          409,
        );
        const foreign = (
          await (
            await api(
              "contacts",
              "POST",
              { displayName: "Foreign", requestKey: crypto.randomUUID() },
              "other",
              other,
            )
          ).json()
        ).id;
        assert.equal(
          (
            await api("contacts/" + subject + "/communication", "POST", {
              ...b,
              responsibleContactId: foreign,
            })
          ).status,
          404,
        );
        assert.equal(
          (await api("contacts/" + subject + "/communication", "POST", b))
            .status,
          200,
        );
        assert.equal(
          (
            await (
              await api("contacts/" + subject + "/communication", "POST", b)
            ).json()
          ).replayed,
          true,
        );
        assert.equal(
          (
            await api("contacts/" + subject + "/communication", "POST", {
              ...b,
              priority: 6,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await api("contacts/" + subject + "/communication", "POST", {
              ...b,
              version: (await get(subject)).version,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "ending retains reason/history; archive ends incoming responsibilities and restore does not reactivate",
      async () => {
        const all = await (
            await api("contacts/" + subject + "/communication?q=Unrelated")
          ).json(),
          a = all.items.find((a: any) => a.channel === "email");
        await write(
          "contacts/" + subject + "/communication/" + a.id,
          "DELETE",
          {
            version: (await get(subject)).version,
            assignmentVersion: a.version,
            reason: "Changed contact policy",
          },
        );
        assert.equal(
          (
            await (
              await api("contacts/" + subject + "/communication?q=Unrelated")
            ).json()
          ).total,
          2,
        );
        assert.equal(
          (
            await (
              await api(
                "contacts/" +
                  subject +
                  "/communication?q=Unrelated&history=true",
              )
            ).json()
          ).total,
          3,
        );
        assert.equal((await get(responsible)).communicationDependentCount, 1);
        await write("contacts/" + responsible + "/archive", "POST", {
          version: (await get(responsible)).version,
        });
        assert.ok(
          !(await route()).emergency.candidates.some(
            (c: any) => c.contactId === responsible,
          ),
        );
        await write("contacts/" + responsible + "/restore", "POST", {
          version: (await get(responsible)).version,
        });
        assert.equal((await route()).emergency.candidates[0].direct, true);
        const historic = await (
          await api(
            "contacts/" + subject + "/communication?q=Unrelated&history=true",
          )
        ).json();
        assert.ok(historic.items.every((a: any) => a.validTo));
      },
    );
    await t.test(
      "hosted adapter synchronizes staff authorization, future organizations and revocation atomically",
      async () => {
        await db.exec(await readFile("db/rebuild/hosting.sql", "utf8"));
        const hosted = "33333333-3333-4333-8333-333333333333";
        await db.query(
          `insert into public.hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Hosted','hosted','UTC','staff',gen_random_uuid())`,
          [hosted],
        );
        await db.query(
          `insert into public.hub_memberships(organization_id,user_id,role) values($1,'staff','admin')`,
          [hosted],
        );
        assert.equal((await store.context("staff", hosted))?.name, "Hosted");
        const c = await api(
          "contacts",
          "POST",
          { displayName: "Hosted contact", requestKey: crypto.randomUUID() },
          "staff",
          hosted,
        );
        assert.equal(c.status, 200);
        await db.query(
          `update public.hub_memberships set role='volunteer' where organization_id=$1`,
          [hosted],
        );
        assert.equal(await store.context("staff", hosted), null);
        await db.query(
          `update public.hub_memberships set role='owner' where organization_id=$1`,
          [hosted],
        );
        assert.ok(await store.context("staff", hosted));
        await db.query(
          `delete from public.hub_memberships where organization_id=$1`,
          [hosted],
        );
        assert.equal(await store.context("staff", hosted), null);
        await db.query(
          `insert into public.hub_memberships(organization_id,user_id,role) values($1,'staff','admin')`,
          [hosted],
        );
        assert.ok(await store.context("staff", hosted));
        await db.query(
          `delete from public.hub_memberships where organization_id=$1`,
          [hosted],
        );
        assert.equal(await store.context("staff", hosted), null);
      },
    );
    await t.test(
      "audit failure rolls back preference and receipt; current access denies reads and replay",
      async () => {
        await db.exec(
          `create function himmah.fail_communication_audit() returns trigger language plpgsql as $$begin if NEW.action='communication_preferences' then raise exception 'fixture'; end if; return NEW; end $$; create trigger communication_audit_failure before insert on himmah.people_audit_events for each row execute function himmah.fail_communication_audit();`,
        );
        const b = {
          version: (await get(subject)).version,
          routineDirectAllowed: true,
          emergencyDirectAllowed: false,
          requestKey: crypto.randomUUID(),
        };
        assert.equal(
          (
            await api(
              "contacts/" + subject + "/communication-preferences",
              "PATCH",
              b,
            )
          ).status,
          503,
        );
        assert.equal((await route()).preferences.routineDirectAllowed, false);
        assert.equal((await get(subject)).version, b.version);
        assert.equal(
          (
            await db.query(
              "select 1 from himmah.operation_receipts where request_key=$1",
              [b.requestKey],
            )
          ).rows.length,
          0,
        );
        await db.exec(
          "drop trigger communication_audit_failure on himmah.people_audit_events",
        );
        assert.equal(
          (
            await api(
              "contacts/" + subject + "/communication-preferences",
              "PATCH",
              b,
            )
          ).status,
          200,
        );
        for (const user of ["volunteer", "other"])
          for (const child of ["routing", "communication"])
            assert.equal(
              (
                await api(
                  "contacts/" + subject + "/" + child,
                  "GET",
                  undefined,
                  user,
                )
              ).status,
              404,
            );
        await db.query(
          `update himmah.staff_memberships set active=false where organization_id=$1 and user_id='owner'`,
          [org],
        );
        assert.equal(
          (
            await api(
              "contacts/" + subject + "/communication-preferences",
              "PATCH",
              b,
            )
          ).status,
          404,
        );
      },
    );
  } finally {
    await db.close();
  }
});
