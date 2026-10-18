import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { createCommunityStore } from "../src/server/community-store.ts";
import { communityApi } from "../src/server/community-api.ts";
import {
  pageInput,
  pageResult,
  newToken,
  tokenHash,
  type Person,
} from "../src/community/contracts.ts";
import type { OrganizationStore } from "../src/server/store.ts";

const orgA = "11111111-1111-4111-8111-111111111111",
  orgB = "22222222-2222-4222-8222-222222222222";
const url = "https://himmah.example";
test("cursor pages are bounded, Unicode-safe and bound to tenant, search and filters", () => {
  const input = pageInput(
    new URL(url + "?limit=1&q=" + encodeURIComponent("İyilik")),
    orgA + "/people",
  );
  const row = {
    id: crypto.randomUUID(),
    createdAt: "2026-10-18 12:00:00.123456+00",
  };
  const page = pageResult([row, { ...row, id: crypto.randomUUID() }], input);
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
  const decoded = pageInput(
    new URL(
      url +
        "?limit=1&q=" +
        encodeURIComponent("İyilik") +
        "&cursor=" +
        page.nextCursor,
    ),
    orgA + "/people",
  );
  assert.deepEqual(decoded.after, { at: row.createdAt, id: row.id });
  assert.throws(() => pageInput(new URL(url + "?limit=51"), orgA));
  assert.throws(() =>
    pageInput(
      new URL(url + "?q=other&cursor=" + page.nextCursor),
      orgA + "/people",
    ),
  );
  assert.throws(() =>
    pageInput(
      new URL(
        url +
          "?q=" +
          encodeURIComponent("İyilik") +
          "&cursor=" +
          page.nextCursor,
      ),
      orgB + "/people",
    ),
  );
  assert.equal(pageResult([row], input).nextCursor, null);
});

test("real PostgreSQL directory rules: isolation, keyset pages, idempotency, concurrency, consent, invitations and roles", async (t) => {
  const db = new PGlite();
  try {
    for (const file of [
      "0000_wild_iron_monger.sql",
      "0001_quiet_miracleman.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../db/migrations/generated/" + file, import.meta.url),
          "utf8",
        ),
      );
    await db.query(
      `insert into hub_organizations (id,name,slug,timezone,created_by,creation_key) values ($1,'Test Community A','test-a','UTC','owner-a',$3),($2,'Test Community B','test-b','UTC','owner-b',$4)`,
      [orgA, orgB, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships (organization_id,user_id,role) values ($1,'owner-a','owner'),($1,'admin-a','admin'),($1,'volunteer-a','volunteer'),($2,'owner-b','owner')`,
      [orgA, orgB],
    );
    const dialect = new PgDialect();
    const store = createCommunityStore(
      "postgresql://test:test@localhost/test",
      async (statement) => {
        const query = dialect.sqlToQuery(statement);
        return (
          await db.query<Record<string, unknown>>(query.sql, query.params)
        ).rows;
      },
    );
    const page = (scope: string, query = "") =>
      pageInput(new URL(url + "?limit=2" + query), scope);
    const key = crypto.randomUUID();
    const person = (
      await store.create("owner-a", orgA, "people", "Nickname One", key)
    )[0]!;
    const group = (
      await store.create(
        "owner-a",
        orgA,
        "groups",
        "Helpers",
        crypto.randomUUID(),
      )
    )[0]!;
    await t.test(
      "creation retries do not duplicate records or audit entries",
      async () => {
        const retry = (
          await store.create(
            "owner-a",
            orgA,
            "people",
            "Ignored retry name",
            key,
          )
        )[0]!;
        assert.equal(retry.id, person.id);
        assert.equal(retry.name, "Nickname One");
        assert.equal(
          (
            await db.query<{ n: number }>(
              `select count(*)::int n from hub_directory_audit where action='people.create'`,
            )
          ).rows[0]!.n,
          1,
        );
      },
    );
    await t.test(
      "cross-organization and volunteer directory access are denied in SQL",
      async () => {
        assert.deepEqual(
          await store.list("owner-b", orgA, "people", page(orgA + "/people")),
          [],
        );
        assert.deepEqual(
          await store.create(
            "volunteer-a",
            orgA,
            "people",
            "Forbidden",
            crypto.randomUUID(),
          ),
          [],
        );
        assert.deepEqual(
          await store.update(
            "owner-b",
            orgA,
            "people",
            String(person.id),
            1,
            "Forbidden",
            null,
          ),
          [],
        );
      },
    );
    await t.test(
      "group assignment is retry-safe and cannot cross organizations",
      async () => {
        const foreign = (
          await store.create(
            "owner-b",
            orgB,
            "groups",
            "Foreign",
            crypto.randomUUID(),
          )
        )[0]!;
        assert.deepEqual(
          await store.setGroup(
            "owner-a",
            orgA,
            String(person.id),
            String(foreign.id),
            true,
          ),
          [],
        );
        await store.setGroup(
          "owner-a",
          orgA,
          String(person.id),
          String(group.id),
          true,
        );
        await store.setGroup(
          "owner-a",
          orgA,
          String(person.id),
          String(group.id),
          true,
        );
        assert.equal(
          (
            await store.list(
              "owner-a",
              orgA,
              "people",
              page(orgA + "/people", "&group=" + group.id),
            )
          ).length,
          1,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from hub_group_people",
            )
          ).rows[0]!.n,
          1,
        );
        await assert.rejects(() =>
          db.query(
            "insert into hub_group_people (organization_id,person_id,group_id) values ($1,$2,$3)",
            [orgA, person.id, foreign.id],
          ),
        );
      },
    );
    await t.test(
      "stale changes are rejected and archiving preserves group history",
      async () => {
        assert.equal(
          (
            await store.update(
              "owner-a",
              orgA,
              "people",
              String(person.id),
              1,
              null,
              true,
            )
          ).length,
          1,
        );
        assert.deepEqual(
          await store.update(
            "owner-a",
            orgA,
            "people",
            String(person.id),
            1,
            "Stale",
            null,
          ),
          [],
        );
        assert.equal(
          (await store.list("owner-a", orgA, "people", page(orgA + "/people")))
            .length,
          0,
        );
        assert.equal(
          (
            await store.list(
              "owner-a",
              orgA,
              "people",
              page(orgA + "/people", "&archived=true"),
            )
          ).length,
          1,
        );
        await store.update(
          "owner-a",
          orgA,
          "people",
          String(person.id),
          2,
          null,
          false,
        );
        assert.equal(
          (
            await store.list(
              "owner-a",
              orgA,
              "people",
              page(orgA + "/people", "&group=" + group.id),
            )
          ).length,
          1,
        );
      },
    );
    await t.test(
      "single-group reads enforce tenant and role scope and hide archived groups",
      async () => {
        const [group] = await store.create(
          "owner-a",
          orgA,
          "groups",
          "Routed group",
          crypto.randomUUID(),
        );
        const [other] = await store.create(
          "owner-b",
          orgB,
          "groups",
          "Other routed group",
          crypto.randomUUID(),
        );
        assert.equal(
          (await store.group("owner-a", orgA, String(group!.id)))[0]?.name,
          "Routed group",
        );
        assert.equal(
          (await store.group("owner-b", orgA, String(group!.id))).length,
          0,
        );
        assert.equal(
          (await store.group("volunteer-a", orgA, String(group!.id))).length,
          0,
        );
        assert.equal(
          (await store.group("owner-a", orgA, String(other!.id))).length,
          0,
        );
        assert.equal(
          (await store.group("owner-a", orgB, String(other!.id))).length,
          0,
        );
        await store.update(
          "owner-a",
          orgA,
          "groups",
          String(group!.id),
          1,
          null,
          true,
        );
        assert.equal(
          (await store.group("owner-a", orgA, String(group!.id))).length,
          0,
        );
      },
    );
    await t.test(
      "member group options report assignments on bounded pages with person and tenant isolation",
      async () => {
        const [member] = await store.create(
          "owner-a",
          orgA,
          "people",
          "Picker member",
          crypto.randomUUID(),
        );
        const [another] = await store.create(
          "owner-a",
          orgA,
          "people",
          "Other picker member",
          crypto.randomUUID(),
        );
        const [joined] = await store.create(
          "owner-a",
          orgA,
          "groups",
          "Picker joined",
          crypto.randomUUID(),
        );
        const [free] = await store.create(
          "owner-a",
          orgA,
          "groups",
          "Picker available",
          crypto.randomUUID(),
        );
        await store.setGroup(
          "owner-a",
          orgA,
          String(member!.id),
          String(joined!.id),
          true,
        );
        const scope = "owner-a:" + orgA + "/group-options/" + member!.id;
        const input = pageInput(new URL(url + "?limit=1&q=Picker"), scope);
        const firstPage = pageResult(
          (await store.groupOptions(
            "owner-a",
            orgA,
            String(member!.id),
            input,
          )) as unknown as (Person & { assigned: boolean })[],
          input,
        );
        assert.equal(firstPage.items.length, 1);
        assert.ok(firstPage.nextCursor);
        const next = pageInput(
          new URL(url + "?limit=1&q=Picker&cursor=" + firstPage.nextCursor),
          scope,
        );
        const second = pageResult(
          (await store.groupOptions(
            "owner-a",
            orgA,
            String(member!.id),
            next,
          )) as unknown as (Person & { assigned: boolean })[],
          next,
        );
        const options = [...firstPage.items, ...second.items];
        assert.equal(options.find((x) => x.id === joined!.id)?.assigned, true);
        assert.equal(options.find((x) => x.id === free!.id)?.assigned, false);
        assert.equal(second.nextCursor, null);
        assert.throws(() =>
          pageInput(
            new URL(url + "?q=Picker&cursor=" + firstPage.nextCursor),
            "owner-a:" + orgA + "/group-options/" + another!.id,
          ),
        );
        assert.equal(
          (await store.groupOptions("owner-b", orgA, String(member!.id), input))
            .length,
          0,
        );
        assert.equal(
          (
            await store.groupOptions(
              "volunteer-a",
              orgA,
              String(member!.id),
              input,
            )
          ).length,
          0,
        );
        assert.equal(
          (await store.groupOptions("owner-a", orgB, String(member!.id), input))
            .length,
          0,
        );
        assert.ok(
          (
            await store.groupOptions(
              "owner-a",
              orgA,
              String(another!.id),
              pageInput(new URL(url + "?q=Picker"), "other"),
            )
          ).every((x) => x.assigned === false),
        );
        await store.update(
          "owner-a",
          orgA,
          "groups",
          String(joined!.id),
          1,
          null,
          true,
        );
        assert.ok(
          (
            await store.groupOptions("owner-a", orgA, String(member!.id), input)
          ).every((x) => x.id !== joined!.id),
        );
        await store.update(
          "owner-a",
          orgA,
          "people",
          String(member!.id),
          1,
          null,
          true,
        );
        assert.equal(
          (await store.person("owner-a", orgA, String(member!.id))).length,
          0,
        );
        assert.equal(
          (await store.groupOptions("owner-a", orgA, String(member!.id), input))
            .length,
          0,
        );
        await store.update(
          "owner-a",
          orgA,
          "people",
          String(another!.id),
          1,
          null,
          true,
        );
      },
    );
    await t.test(
      "keyset pagination has no duplicates for equal timestamps and literal wildcard search",
      async () => {
        for (let i = 0; i < 5; i++)
          await store.create(
            "owner-a",
            orgA,
            "people",
            "Person " + i,
            crypto.randomUUID(),
          );
        await db.query(
          "update hub_people set created_at=$1 where organization_id=$2",
          ["2026-10-18 10:00:00.123456+00", orgA],
        );
        let cursor: string | null = null;
        const seen = new Set<string>();
        let pages = 0;
        do {
          const p = page(orgA + "/people", cursor ? "&cursor=" + cursor : "");
          const result = pageResult(
            (await store.list(
              "owner-a",
              orgA,
              "people",
              p,
            )) as unknown as Person[],
            p,
          );
          for (const item of result.items) {
            assert.ok(!seen.has(item.id));
            seen.add(item.id);
          }
          cursor = result.nextCursor;
          pages++;
        } while (cursor && pages < 10);
        assert.equal(seen.size, 6);
        assert.equal(pages, 3);
        assert.deepEqual(
          await store.list(
            "owner-a",
            orgA,
            "people",
            page(orgA + "/people", "&q=%25"),
          ),
          [],
        );
      },
    );
    await t.test(
      "staff permissions protect owners, self-removal and administrator grants",
      async () => {
        assert.deepEqual(
          await store.changeStaff("owner-a", orgA, "owner-a", "owner", null),
          [],
        );
        assert.deepEqual(
          await store.changeStaff(
            "admin-a",
            orgA,
            "volunteer-a",
            "volunteer",
            "admin",
          ),
          [],
        );
        assert.deepEqual(
          await store.changeStaff("admin-a", orgA, "owner-a", "owner", null),
          [],
        );
      },
    );
    await t.test(
      "invitations bind verified recipient identity, expire, revoke and cannot resurrect removed access",
      async () => {
        const hash = await tokenHash(newToken());
        await store.invite(
          "owner-a",
          orgA,
          "invited@example.invalid",
          "volunteer",
          crypto.randomUUID(),
          hash,
        );
        assert.equal(
          (
            await store.preview(
              {
                id: "invited",
                name: "Invited",
                email: "invited@example.invalid",
              },
              hash,
            )
          )[0]!.name,
          "Test Community A",
        );
        assert.deepEqual(
          await store.preview(
            { id: "wrong", name: "Wrong", email: "other@example.invalid" },
            hash,
          ),
          [],
        );
        assert.deepEqual(
          await store.accept(
            { id: "wrong", name: "Wrong", email: "other@example.invalid" },
            hash,
          ),
          [],
        );
        const identity = {
          id: "invited",
          name: "Invited Staff",
          email: "INVITED@example.invalid",
        };
        assert.equal((await store.accept(identity, hash))[0]!.id, orgA);
        assert.equal((await store.accept(identity, hash))[0]!.id, orgA);
        await store.changeStaff("owner-a", orgA, "invited", "volunteer", null);
        assert.deepEqual(await store.accept(identity, hash), []);
        const existingHash = await tokenHash(newToken());
        await store.invite(
          "owner-a",
          orgA,
          "existing@example.invalid",
          "admin",
          crypto.randomUUID(),
          existingHash,
        );
        const existing = {
          id: "volunteer-a",
          name: "Existing",
          email: "existing@example.invalid",
        };
        assert.equal(
          (await store.preview(existing, existingHash))[0]!.role,
          "volunteer",
        );
        await store.accept(existing, existingHash);
        assert.equal(
          (
            await db.query<{ role: string }>(
              "select role from hub_memberships where organization_id=$1 and user_id='volunteer-a'",
              [orgA],
            )
          ).rows[0]!.role,
          "volunteer",
        );
        const expiredHash = await tokenHash(newToken());
        const expired = (
          await store.invite(
            "owner-a",
            orgA,
            "invited@example.invalid",
            "volunteer",
            crypto.randomUUID(),
            expiredHash,
          )
        )[0]!;
        await db.query(
          "update hub_invitations set expires_at=now()-interval '1 minute' where id=$1",
          [expired.id],
        );
        assert.deepEqual(await store.accept(identity, expiredHash), []);
        const revokedHash = await tokenHash(newToken());
        const revoked = (
          await store.invite(
            "owner-a",
            orgA,
            "invited@example.invalid",
            "volunteer",
            crypto.randomUUID(),
            revokedHash,
          )
        )[0]!;
        await store.revoke("owner-a", orgA, String(revoked.id));
        assert.deepEqual(await store.accept(identity, revokedHash), []);
      },
    );
    await t.test(
      "API rejects missing consent and verified-email/tenant/role bypasses",
      async () => {
        const organizations: OrganizationStore = {
          list: async () => [],
          create: async () => {
            throw Error();
          },
          get: async (user, id) =>
            id === orgA && ["owner-a", "admin-a", "volunteer-a"].includes(user)
              ? {
                  id: orgA,
                  name: "Test",
                  slug: "test",
                  timezone: "UTC",
                  role:
                    user === "owner-a"
                      ? "owner"
                      : user === "admin-a"
                        ? "admin"
                        : "volunteer",
                  createdAt: new Date().toISOString(),
                }
              : null,
        };
        const identity = {
          id: "owner-a",
          email: "owner@example.invalid",
          name: "Owner",
          emailVerified: true,
        };
        const [routedGroup] = await store.create(
          "owner-a",
          orgA,
          "groups",
          "API routed group",
          crypto.randomUUID(),
        );
        const groupPath =
          "/api/organizations/" + orgA + "/groups/" + routedGroup!.id;
        const detail = await communityApi(
          new Request(url + groupPath),
          identity,
          organizations,
          store,
        );
        assert.equal(detail!.status, 200);
        assert.equal(detail!.headers.get("Cache-Control"), "no-store");
        assert.equal((await detail!.json()).item.name, "API routed group");
        assert.equal(
          (await communityApi(
            new Request(url + groupPath),
            { ...identity, id: "volunteer-a" },
            organizations,
            store,
          ))!.status,
          403,
        );
        await store.update(
          "owner-a",
          orgA,
          "groups",
          String(routedGroup!.id),
          1,
          null,
          true,
        );
        assert.equal(
          (await communityApi(
            new Request(url + groupPath),
            identity,
            organizations,
            store,
          ))!.status,
          404,
        );
        const optionsPath =
          "/api/organizations/" +
          orgA +
          "/people/" +
          person.id +
          "/group-options";
        const optionsResponse = await communityApi(
          new Request(url + optionsPath),
          identity,
          organizations,
          store,
        );
        assert.equal(optionsResponse!.status, 200);
        assert.equal(optionsResponse!.headers.get("Cache-Control"), "no-store");
        const optionBody = await optionsResponse!.json();
        assert.ok(
          optionBody.items.every(
            (x: { assigned: unknown }) => typeof x.assigned === "boolean",
          ),
        );
        assert.equal(
          (await communityApi(
            new Request(url + optionsPath),
            { ...identity, id: "volunteer-a" },
            organizations,
            store,
          ))!.status,
          403,
        );
        assert.equal(
          (await communityApi(
            new Request(
              url +
                "/api/organizations/" +
                orgB +
                "/people/" +
                person.id +
                "/group-options",
            ),
            identity,
            organizations,
            store,
          ))!.status,
          404,
        );
        assert.equal(
          (await communityApi(
            new Request(
              url +
                "/api/organizations/" +
                orgA +
                "/people/" +
                crypto.randomUUID() +
                "/group-options",
            ),
            identity,
            organizations,
            store,
          ))!.status,
          404,
        );
        const firstPage = await communityApi(
          new Request(url + "/api/organizations/" + orgA + "/people?limit=1"),
          identity,
          organizations,
          store,
        );
        const firstBody = await firstPage!.json();
        assert.ok(firstBody.nextCursor);
        const anotherAccount = await communityApi(
          new Request(
            url +
              "/api/organizations/" +
              orgA +
              "/people?limit=1&cursor=" +
              firstBody.nextCursor,
          ),
          { ...identity, id: "admin-a" },
          organizations,
          store,
        );
        assert.equal(anotherAccount!.status, 400);
        const request = (path: string, body: unknown) =>
          new Request(url + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        assert.equal(
          (await communityApi(
            request("/api/organizations/" + orgA + "/people", {
              name: "Nickname",
              key: crypto.randomUUID(),
            }),
            identity,
            organizations,
            store,
          ))!.status,
          400,
        );
        assert.equal(
          (await communityApi(
            new Request(url + "/api/organizations/" + orgA + "/people"),
            { ...identity, id: "volunteer-a" },
            organizations,
            store,
          ))!.status,
          403,
        );
        assert.equal(
          (await communityApi(
            new Request(url + "/api/organizations/" + orgB + "/people"),
            identity,
            organizations,
            store,
          ))!.status,
          404,
        );
        assert.equal(
          (await communityApi(
            request("/api/invitations/accept", { token: newToken() }),
            { ...identity, emailVerified: false },
            organizations,
            store,
          ))!.status,
          403,
        );
      },
    );
  } finally {
    await db.close();
  }
});
