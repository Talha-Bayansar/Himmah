import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { peopleApi } from "../src/modules/people/api.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
test("Groups and relationships run through real SQL/API with isolation, history and audited retries", async (t) => {
  const db = new PGlite();
  try {
    for (const file of (await readdir("db/migrations/generated"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile("db/migrations/generated/" + file, "utf8"));
    await db.exec(await readFile("db/rebuild/contacts.sql", "utf8"));
    await db.exec(await readFile("db/rebuild/directory.sql", "utf8"));
    await db.exec(await readFile("db/rebuild/communication.sql", "utf8"));
    await db.query(
      `insert into himmah.organizations(id,name,created_by,updated_by) values($1,'A','owner','owner'),($2,'B','other','other')`,
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
          `https://himmah.test/api/organizations/${tenant}/people/` + path,
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
      const response = await api(path, method, {
        ...body,
        requestKey: crypto.randomUUID(),
      });
      assert.equal(
        response.status,
        200,
        JSON.stringify(await response.clone().json()),
      );
      return response.json();
    };
    const c1 = (await write("contacts", "POST", { displayName: "Ali" })).id,
      c2 = (await write("contacts", "POST", { displayName: "Mehmet" })).id;
    const contact = async (id: string) => (await api("contacts/" + id)).json();
    let groupId = "",
      membershipId = "",
      father: any,
      sibling: any;
    await t.test(
      "default types seeded and a group can be created/edited without any game/account",
      async () => {
        const types = await (await api("relationship-types")).json();
        assert.equal(types.items.length, 5);
        father = types.items.find((x: any) => x.code === "father");
        sibling = types.items.find((x: any) => x.code === "sibling");
        assert.equal(father.forwardLabels.nl, "Vader");
        const key = crypto.randomUUID(),
          body = {
            name: "Youth",
            description: "Friday group",
            requestKey: key,
          };
        groupId = (await (await api("groups", "POST", body)).json()).id;
        assert.equal(
          (await (await api("groups", "POST", body)).json()).id,
          groupId,
        );
        assert.equal(
          (await api("groups", "POST", { ...body, name: "Changed" })).status,
          409,
        );
        await write("groups/" + groupId, "PATCH", {
          name: "Young people",
          description: null,
          version: 1,
        });
        assert.equal(
          (
            await api("groups/" + groupId, "PATCH", {
              name: "Stale",
              version: 1,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "bulk assignment returns per-contact outcomes and replays without duplicates",
      async () => {
        const b = {
          version: 2,
          contacts: [
            { id: c1, version: 1 },
            { id: c2, version: 999 },
          ],
          requestKey: crypto.randomUUID(),
        };
        const response = await (
          await api("groups/" + groupId + "/assignments", "POST", b)
        ).json();
        assert.equal(
          response.outcomes.find((x: any) => x.id === c1).outcome,
          "saved",
        );
        assert.equal(
          response.outcomes.find((x: any) => x.id === c2).outcome,
          "version_conflict",
        );
        assert.equal(
          (
            await (
              await api("groups/" + groupId + "/assignments", "POST", b)
            ).json()
          ).replayed,
          true,
        );
        let rows = await (await api("groups/" + groupId + "/members")).json();
        assert.equal(rows.items.length, 1);
        membershipId = rows.items[0].id;
        assert.equal(
          (await (await api("contacts/" + c1 + "/memberships")).json()).items[0]
            .groupId,
          groupId,
        );
        const options = await (
          await api("groups/" + groupId + "/member-options")
        ).json();
        assert.equal(
          options.items.find((x: any) => x.id === c1).assigned,
          true,
        );
      },
    );
    await t.test(
      "membership ending requires reason, preserves interval, and rejoining makes a new interval",
      async () => {
        assert.equal(
          (
            await api(
              "groups/" + groupId + "/members/" + membershipId,
              "DELETE",
              {
                version: 3,
                membershipVersion: 1,
                reason: "",
                requestKey: crypto.randomUUID(),
              },
            )
          ).status,
          400,
        );
        await write(
          "groups/" + groupId + "/members/" + membershipId,
          "DELETE",
          { version: 3, membershipVersion: 1, reason: "Changed group" },
        );
        assert.equal(
          (await (await api("groups/" + groupId + "/members")).json()).items
            .length,
          0,
        );
        let rows = (
          await (
            await api("groups/" + groupId + "/members?history=true")
          ).json()
        ).items;
        assert.equal(rows[0].endReason, "Changed group");
        const audit = (
          await db.query<{
            contact_id: string;
            actor_id: string;
            reason: string;
          }>(
            "select contact_id,actor_id,reason from himmah.group_events where action='end_membership' and group_id=$1",
            [groupId],
          )
        ).rows[0]!;
        assert.equal(audit.contact_id, c1);
        assert.equal(audit.actor_id, "owner");
        assert.equal(audit.reason, "Changed group");

        assert.ok(new Date(rows[0].validTo) > new Date(rows[0].validFrom));
        const g = await (await api("groups/" + groupId)).json(),
          c = await contact(c1);
        await write("groups/" + groupId + "/assignments", "POST", {
          version: g.version,
          contacts: [{ id: c1, version: c.version }],
        });
        rows = (
          await (
            await api("groups/" + groupId + "/members?history=true")
          ).json()
        ).items;
        assert.equal(rows.length, 2);
        assert.notEqual(rows[0].id, rows[1].id);
        await assert.rejects(
          db.query(
            `insert into himmah.group_memberships(organization_id,group_id,contact_id,valid_from,valid_to,created_by,updated_by) values($1,$2,$3,'2000-01-01',null,'owner','owner')`,
            [org, groupId, c1],
          ),
        );
      },
    );
    await t.test(
      "group/contact archive ends membership and restore does not reactivate it",
      async () => {
        let c = await contact(c1);
        await write("contacts/" + c1 + "/archive", "POST", {
          version: c.version,
        });
        assert.equal(
          (await (await api("groups/" + groupId + "/members")).json()).items
            .length,
          0,
        );
        const g = await (await api("groups/" + groupId)).json();
        assert.equal(g.memberCount, 0);
        c = await contact(c1);
        await write("contacts/" + c1 + "/restore", "POST", {
          version: c.version,
        });
        assert.equal(
          (await (await api("groups/" + groupId + "/members")).json()).items
            .length,
          0,
        );
        await write("groups/" + groupId + "/assignments", "POST", {
          version: g.version,
          contacts: [{ id: c2, version: (await contact(c2)).version }],
        });
        let current = await (await api("groups/" + groupId)).json();
        await write("groups/" + groupId + "/archive", "POST", {
          version: current.version,
        });
        current = await (await api("groups/" + groupId)).json();
        await write("groups/" + groupId + "/restore", "POST", {
          version: current.version,
        });
        assert.equal(
          (await (await api("groups/" + groupId + "/members")).json()).items
            .length,
          0,
        );
      },
    );
    let relationshipId = "";
    await t.test(
      "directional relationship shows one stored edge and correct inverse from both contacts",
      async () => {
        const body = {
          version: (await contact(c1)).version,
          otherContactId: c2,
          otherVersion: (await contact(c2)).version,
          typeId: father.id,
          typeVersionId: father.typeVersionId,
          direction: "other_is_role",
          requestKey: crypto.randomUUID(),
        };
        const response = await api(
          "contacts/" + c1 + "/relationships",
          "POST",
          body,
        );
        assert.equal(
          response.status,
          200,
          JSON.stringify(await response.clone().json()),
        );
        relationshipId = (await response.json()).relationshipId;
        assert.equal(
          (
            await (
              await api("contacts/" + c1 + "/relationships", "POST", body)
            ).json()
          ).replayed,
          true,
        );
        const a = (
            await (await api("contacts/" + c1 + "/relationships")).json()
          ).items[0],
          b = (await (await api("contacts/" + c2 + "/relationships")).json())
            .items[0];
        assert.equal(a.subjectIsSource, false);
        assert.equal(b.subjectIsSource, true);
        assert.equal(a.forwardLabels.en, "Father");
        assert.equal(b.inverseLabels.en, "Child");
        assert.equal(a.contactId, c2);
        assert.equal(a.id, b.id);
        const count = (
          await db.query<{ n: number }>(
            "select count(*)::int n from himmah.contact_relationships",
          )
        ).rows[0]!.n;
        assert.equal(count, 1);
      },
    );
    await t.test(
      "label changes create immutable versions and do not rewrite prior relationship labels",
      async () => {
        await write("relationship-types/" + father.id, "PATCH", {
          version: father.version,
          forwardLabels: { en: "Dad", nl: "Papa", tr: "Baba" },
          inverseLabels: father.inverseLabels,
        });
        assert.equal(
          (await (await api("contacts/" + c1 + "/relationships")).json())
            .items[0].forwardLabels.en,
          "Father",
        );
        assert.equal(
          (await (await api("relationship-types/" + father.id)).json())
            .forwardLabels.en,
          "Dad",
        );
        await assert.rejects(
          db.query(
            `update himmah.relationship_type_versions set forward_labels='{}' where id=$1`,
            [father.typeVersionId],
          ),
        );
        await assert.rejects(
          db.query(
            `update himmah.relationship_types set "symmetric"=true where id=$1`,
            [father.id],
          ),
        );
      },
    );
    await t.test(
      "ending relationships preserves reason/history and does not change family access",
      async () => {
        const body = {
          version: (await contact(c1)).version,
          relationshipVersion: 1,
          reason: "Corrected family record",
          requestKey: crypto.randomUUID(),
        };
        assert.equal(
          (
            await api(
              "contacts/" + c1 + "/relationships/" + relationshipId,
              "DELETE",
              body,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await api(
              "contacts/" + c1 + "/relationships/" + relationshipId,
              "DELETE",
              body,
            )
          ).status,
          200,
        );
        assert.equal(
          (await (await api("contacts/" + c1 + "/relationships")).json()).items
            .length,
          0,
        );
        assert.equal(
          (
            await (
              await api("contacts/" + c2 + "/relationships?history=true")
            ).json()
          ).items[0].endReason,
          "Corrected family record",
        );
        assert.equal(
          (await api("contacts/" + c1, "GET", undefined, "volunteer")).status,
          404,
        );
      },
    );
    await t.test(
      "symmetric edge canonicalization rejects reversed duplicates, self-links and foreign tenant IDs",
      async () => {
        const payload = async (subject: string, otherId: string) => ({
          version: (await contact(subject)).version,
          otherContactId: otherId,
          otherVersion: (await contact(otherId)).version,
          typeId: sibling.id,
          typeVersionId: sibling.typeVersionId,
          direction: "other_is_role",
        });
        await write(
          "contacts/" + c1 + "/relationships",
          "POST",
          await payload(c1, c2),
        );
        assert.equal(
          (
            await api("contacts/" + c2 + "/relationships", "POST", {
              ...(await payload(c2, c1)),
              requestKey: crypto.randomUUID(),
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await api("contacts/" + c1 + "/relationships", "POST", {
              ...(await payload(c1, c1)),
              requestKey: crypto.randomUUID(),
            })
          ).status,
          400,
        );
        const foreign = await (
          await api(
            "contacts",
            "POST",
            { displayName: "Foreign", requestKey: crypto.randomUUID() },
            "other",
            other,
          )
        ).json();
        assert.equal(
          (
            await api("contacts/" + c1 + "/relationships", "POST", {
              ...(await payload(c1, c2)),
              otherContactId: foreign.id,
              otherVersion: 1,
              requestKey: crypto.randomUUID(),
            })
          ).status,
          404,
        );
        await assert.rejects(
          db.query(
            `insert into himmah.group_memberships(organization_id,group_id,contact_id,created_by,updated_by) values($1,$2,$3,'owner','owner')`,
            [other, groupId, foreign.id],
          ),
        );
        await assert.rejects(
          db.query(
            `insert into himmah.contact_relationships(organization_id,source_contact_id,target_contact_id,type_id,type_version_id,created_by,updated_by) values($1,$2,$3,$4,$5,'owner','owner')`,
            [org, c1, foreign.id, sibling.id, sibling.typeVersionId],
          ),
        );
      },
    );
    await t.test(
      "type archive blocks new edges while preserving old edges; custom types are localized",
      async () => {
        await write("relationship-types/" + sibling.id + "/archive", "POST", {
          version: 1,
        });
        assert.equal(
          (await (await api("contacts/" + c1 + "/relationships")).json()).items
            .length,
          1,
        );
        const custom = await write("relationship-types", "POST", {
          symmetric: false,
          category: "other",
          forwardLabels: { en: "Mentor", nl: "Mentor", tr: "Rehber" },
          inverseLabels: { en: "Mentee", nl: "Leerling", tr: "Öğrenci" },
        });
        assert.equal(
          (await (await api("relationship-types/" + custom.id)).json())
            .forwardLabels.tr,
          "Rehber",
        );
        assert.equal(
          (
            await api("relationship-types", "POST", {
              symmetric: true,
              category: "family",
              forwardLabels: { en: "A", nl: "B", tr: "C" },
              inverseLabels: { en: "D", nl: "E", tr: "F" },
              requestKey: crypto.randomUUID(),
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "growing catalogs, rosters and histories are paginated and scoped",
      async () => {
        for (let n = 0; n < 52; n++)
          await write("groups", "POST", { name: "Group " + n });
        const first = await (await api("groups?limit=25")).json(),
          next = await (
            await api("groups?limit=25&cursor=" + first.nextCursor)
          ).json();
        assert.equal(
          new Set([...first.items, ...next.items].map((x) => x.id)).size,
          50,
        );
        assert.equal(
          (await api("groups?q=other&cursor=" + first.nextCursor)).status,
          400,
        );
        for (const path of [
          "groups",
          "groups/" + groupId,
          "groups/" + groupId + "/members",
          "groups/" + groupId + "/history",
          "relationship-types",
          "contacts/" + c1 + "/relationships",
          "contacts/" + c1 + "/memberships",
        ]) {
          assert.equal(
            (await api(path, "GET", undefined, "volunteer")).status,
            404,
          );
          assert.equal(
            (await api(path, "GET", undefined, "other")).status,
            404,
          );
        }
      },
    );
    await t.test(
      "profile previews have bounded rows, exact scoped totals and complete independent list pages",
      async () => {
        for (let n = 0; n < 8; n++) {
          const g = await write("groups", "POST", {
            name: "Preview group " + n,
          });
          await write("groups/" + g.id + "/assignments", "POST", {
            version: 1,
            contacts: [{ id: c1, version: (await contact(c1)).version }],
          });
          await write("contacts/" + c1 + "/methods", "POST", {
            version: (await contact(c1)).version,
            kind: "email",
            value: "method" + n + "@example.test",
            preferred: false,
          });
        }
        const currentFather = await (
          await api("relationship-types/" + father.id)
        ).json();
        for (let n = 0; n < 7; n++) {
          const person = await write("contacts", "POST", {
            displayName: "Preview Person " + n,
          });
          await write("contacts/" + c1 + "/relationships", "POST", {
            version: (await contact(c1)).version,
            otherContactId: person.id,
            otherVersion: 1,
            typeId: father.id,
            typeVersionId: currentFather.typeVersionId,
            direction: "other_is_role",
          });
        }
        for (const collection of ["methods", "memberships", "relationships"]) {
          const first = await (
            await api("contacts/" + c1 + "/" + collection + "?limit=3")
          ).json();
          assert.equal(first.items.length, 3);
          assert.equal(first.total, 8);
          assert.ok(first.nextCursor);
          const next = await (
            await api(
              "contacts/" +
                c1 +
                "/" +
                collection +
                "?limit=3&cursor=" +
                first.nextCursor,
            )
          ).json();
          assert.equal(next.total, 8);
          assert.equal(
            new Set(
              [...first.items, ...next.items].map((r: { id: string }) => r.id),
            ).size,
            6,
          );
        }
        for (const [collection, query] of [
          ["methods", "method7@"],
          ["memberships", "Preview group 7"],
          ["relationships", "Preview Person 6"],
        ]) {
          const result = await (
            await api(
              "contacts/" +
                c1 +
                "/" +
                collection +
                "?q=" +
                encodeURIComponent(query!),
            )
          ).json();
          assert.equal(result.total, 1);
          assert.equal(result.items.length, 1);
        }
        const all = await (
          await api("contacts/" + c1 + "/relationships?history=true&limit=3")
        ).json();
        assert.equal(all.total, 9);
        assert.equal(all.items.length, 3);
        const history = await (
          await api("contacts/" + c1 + "/history?limit=3")
        ).json();
        assert.equal(history.items.length, 3);
        assert.ok(history.total > 8);
        const later = await (
          await api(
            "contacts/" + c1 + "/history?limit=3&cursor=" + history.nextCursor,
          )
        ).json();
        assert.equal(later.total, history.total);
        assert.equal(
          (
            await api(
              "contacts/" + c1 + "/memberships?cursor=" + history.nextCursor,
            )
          ).status,
          400,
        );
        for (const user of ["volunteer", "other"]) {
          const response = await api(
            "contacts/" + c1 + "/memberships?limit=3",
            "GET",
            undefined,
            user,
          );
          assert.equal(response.status, 404);
          assert.equal((await response.json()).total, undefined);
        }
      },
    );
    await t.test(
      "audit failure rolls back membership, version, and receipt; revocation blocks exact retries",
      async () => {
        const g = await (await api("groups/" + groupId)).json(),
          before = (await contact(c1)).version,
          key = crypto.randomUUID();
        await db.exec(
          `create function himmah.fail_group_audit() returns trigger language plpgsql as $$ begin raise exception 'injected audit failure'; end $$; create trigger fail_group_audit before insert on himmah.group_events for each row execute function himmah.fail_group_audit();`,
        );
        const body = {
          version: g.version,
          contacts: [{ id: c1, version: before }],
          requestKey: key,
        };
        assert.equal(
          (await api("groups/" + groupId + "/assignments", "POST", body))
            .status,
          503,
        );
        assert.equal((await contact(c1)).version, before);
        assert.equal(
          (await (await api("groups/" + groupId + "/members")).json()).items
            .length,
          0,
        );
        await db.exec("drop trigger fail_group_audit on himmah.group_events");
        assert.equal(
          (await api("groups/" + groupId + "/assignments", "POST", body))
            .status,
          200,
        );
        await db.exec(
          `update himmah.staff_memberships set active=false where user_id='owner'`,
        );
        assert.equal(
          (await api("groups/" + groupId + "/assignments", "POST", body))
            .status,
          404,
        );
        assert.equal(
          (
            await store.groupCommand("owner", org, "assign", key, {
              groupId,
              version: g.version,
              contacts: [{ id: c1, version: before }],
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
