import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createLearningStore } from "../src/server/learning-store.ts";
import { learningApi } from "../src/server/learning-api.ts";
import { createStore } from "../src/server/store.ts";
import { pageInput } from "../src/community/contracts.ts";

test("contact learning history preserves explicit assignments, version snapshots and latest submitted results with scoped pagination", async () => {
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
      );
    const org: string = crypto.randomUUID(),
      foreign = crypto.randomUUID(),
      contact: string = crypto.randomUUID(),
      other = crypto.randomUUID(),
      foreignContact = crypto.randomUUID();
    for (const [id, owner, slug] of [
      [org, "owner", "history"],
      [foreign, "foreign", "other"],
    ]) {
      await db.query(
        "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Community',$2,'Europe/Brussels',$3,gen_random_uuid())",
        [id, slug, owner],
      );
      await db.query(
        "insert into hub_memberships(organization_id,user_id,role)values($1,$2,'owner')",
        [id, owner],
      );
    }
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'volunteer','volunteer'),($1,'admin','admin')",
      [org],
    );
    for (const [id, tenant] of [
      [contact, org],
      [other, org],
      [foreignContact, foreign],
    ])
      await db.query(
        "insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,'Alex','owner','owner')",
        [id, tenant],
      );
    const item = crypto.randomUUID(),
      publication = crypto.randomUUID(),
      second = crypto.randomUUID();
    const content = {
      title: "Published snapshot 100%_",
      description: "",
      mode: "assigned",
      release: "manual",
      opensAt: "",
      closesAt: "",
      questions: [
        { text: "Question", choices: ["A", "B"], correct: 0, explanation: "" },
      ],
    };
    await db.query(
      "insert into hub_learning_items(id,organization_id,title,draft,created_by)values($1,$2,'New draft title',$3,'owner')",
      [item, org, JSON.stringify({ ...content, title: "New draft title" })],
    );
    await db.query(
      "insert into hub_learning_versions(id,organization_id,item_id,number,content)values($1,$2,$3,1,$4),($5,$2,$3,2,$4)",
      [publication, org, item, JSON.stringify(content), second],
    );
    const recipients: string[] = [];
    for (let i = 0; i < 53; i++) {
      // Distinct items are unnecessary: one contact may have only one assignment per publication.
      const version =
        i === 0 ? publication : i === 1 ? second : crypto.randomUUID();
      if (i > 1) {
        const anotherItem = crypto.randomUUID(),
          snapshot = { ...content, title: `Quiz ${i}` };
        await db.query(
          "insert into hub_learning_items(id,organization_id,title,draft,created_by)values($1,$2,$3,$4,'owner')",
          [anotherItem, org, snapshot.title, JSON.stringify(snapshot)],
        );
        await db.query(
          "insert into hub_learning_versions(id,organization_id,item_id,number,content)values($1,$2,$3,1,$4)",
          [version, org, anotherItem, JSON.stringify(snapshot)],
        );
      }
      const id = crypto.randomUUID();
      recipients.push(id);
      await db.query(
        "insert into hub_learning_recipients(id,organization_id,publication_id,contact_id,name,created_at,revoked)values($1,$2,$3,$4,'Original name','2026-10-31T12:00:00Z',$5)",
        [id, org, version, contact, i === 0],
      );
    }
    // A same-name guest and a different contact never enter this contact's history.
    await db.query(
      "insert into hub_learning_recipients(organization_id,publication_id,name,guest_hash)values($1,$2,'Alex',$3)",
      [org, publication, "g".repeat(64)],
    );
    await db.query(
      "insert into hub_learning_recipients(organization_id,publication_id,contact_id,name)values($1,$2,$3,'Alex')",
      [org, publication, other],
    );
    await db.query(
      "insert into hub_learning_attempts(organization_id,recipient_id,sequence,answers,submitted_at,score)values($1,$2,1,'{}','2026-10-31T14:00:00Z',0),($1,$3,1,'{\"0\":0}','2026-10-31T15:00:00Z',1)",
      [org, recipients[0], recipients[1]],
    );
    await db.query(
      "insert into hub_learning_attempts(organization_id,recipient_id,sequence)values($1,$2,2)",
      [org, recipients[1]],
    );
    const api = (
      user = "owner",
      target: string = org,
      person: string = contact,
      search = "",
      verified = true,
      method = "GET",
    ) =>
      learningApi(
        new Request(
          `https://himmah.test/api/organizations/${target}/learning/contacts/${person}${search}`,
          { method },
        ),
        { id: user, emailVerified: verified },
        organizations,
        store,
      );
    const response = await api();
    assert.equal(response!.status, 200);
    assert.equal(response!.headers.get("cache-control"), "no-store");
    const page: any = await response!.json();
    assert.equal(page.total, 53);
    assert.equal(page.items.length, 25);
    assert.ok(page.nextCursor);
    const all = [...page.items];
    let cursor = page.nextCursor;
    while (cursor) {
      const next: any = await (await api(
        "owner",
        org,
        contact,
        `?cursor=${encodeURIComponent(cursor)}`,
      ))!.json();
      assert.equal(next.total, 53);
      all.push(...next.items);
      cursor = next.nextCursor;
    }
    assert.equal(all.length, 53);
    assert.equal(new Set(all.map((r) => r.id)).size, 53);
    assert.ok(all.every((r: any) => r.createdAt));
    const submitted = all.find((r) => r.id === recipients[0]);
    assert.equal(submitted.title, content.title);
    assert.equal(submitted.status, "submitted");
    assert.equal(submitted.score, 0);
    assert.equal(submitted.revoked, true);
    assert.equal(submitted.released, false);
    assert.equal(submitted.publicationNumber, 1);
    const retry = all.find((r) => r.id === recipients[1]);
    assert.equal(retry.status, "started");
    assert.equal(retry.attempts, 2);
    assert.equal(retry.submittedSequence, 1);
    assert.equal(retry.score, 1);
    assert.ok(retry.submittedAt);
    assert.equal(all.find((r) => r.id === recipients[2]).status, "invited");
    for (const row of all)
      for (const privateKey of [
        "answers",
        "link_hash",
        "guest_hash",
        "questions",
        "content",
      ])
        assert.equal(row[privateKey], undefined);
    const preview: any = await (await api(
      "owner",
      org,
      contact,
      "?limit=3",
    ))!.json();
    assert.equal(preview.items.length, 3);
    assert.equal(preview.total, 53);
    const literal: any = await (await api(
      "owner",
      org,
      contact,
      "?q=100%25_",
    ))!.json();
    assert.equal(literal.total, 2);
    assert.ok(literal.items.every((r: any) => r.title === content.title));
    const empty: any = await (await api(
      "owner",
      org,
      contact,
      "?q=does-not-match",
    ))!.json();
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.items, []);
    assert.equal((await api("admin"))!.status, 200);
    assert.equal((await api("volunteer"))!.status, 403);
    assert.equal((await api("owner", foreign, foreignContact))!.status, 404);
    assert.equal((await api("owner", org, foreignContact))!.status, 404);
    assert.equal((await api("owner", org, crypto.randomUUID()))!.status, 404);
    assert.equal((await api("owner", org, contact, "", false))!.status, 403);
    assert.equal((await api("owner", org, contact, "?limit=51"))!.status, 400);
    assert.equal(
      (await api("owner", org, contact, "?archived=true"))!.status,
      400,
    );
    assert.equal(
      (await api("owner", org, contact, "", true, "POST"))!.status,
      404,
    );
    for (const [actor, person, search] of [
      ["admin", contact, ""],
      ["owner", other, ""],
      ["owner", contact, "&q=Quiz"],
    ])
      assert.equal(
        (await api(
          actor,
          org,
          person,
          `?cursor=${encodeURIComponent(page.nextCursor)}${search}`,
        ))!.status,
        400,
      );
    assert.equal(
      await store.contactHistory(
        "volunteer",
        org,
        contact,
        pageInput(new URL("https://test"), "test"),
      ),
      null,
    );
    await db.query(
      "update himmah.contacts set archived_at=now(),archived_by='owner',version=version+1 where id=$1",
      [contact],
    );
    assert.equal((await api())!.status, 200);
    await db.query(
      "delete from hub_memberships where organization_id=$1 and user_id='owner'",
      [org],
    );
    assert.equal((await api())!.status, 404);
    assert.equal(
      await store.contactHistory(
        "owner",
        org,
        contact,
        pageInput(new URL("https://test"), "test"),
      ),
      null,
    );
  } finally {
    await db.close();
  }
});
