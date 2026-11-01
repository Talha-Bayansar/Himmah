import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "./database.ts";
import { createLiveStore } from "../src/server/live-store.ts";
import { liveStaffApi, livePublicApi } from "../src/server/live-api.ts";
import { createLearningStore } from "../src/server/learning-store.ts";
import { createStore } from "../src/server/store.ts";
import { hashToken } from "../src/learning/contracts.ts";

test("live SQL/API enforces host phases, isolated guests, locked answers, exact retries and immutable publication scoring", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const dialect = new PgDialect(),
      execute = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<any>(q.sql, q.params)).rows;
      };
    const live = createLiveStore(
        "postgres://isolated:only@localhost/himmah",
        execute,
      ),
      learning = createLearningStore(
        "postgres://isolated:only@localhost/himmah",
        execute,
      ),
      organizations = createStore(
        "postgres://isolated:only@localhost/himmah",
        execute,
      );
    const org = crypto.randomUUID(),
      foreign = crypto.randomUUID(),
      item = crypto.randomUUID(),
      room = crypto.randomUUID();
    for (const [id, user, slug] of [
      [org, "owner", "live-test"],
      [foreign, "other", "other-live"],
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
      "insert into hub_memberships(organization_id,user_id,role)values($1,'volunteer','volunteer'),($1,'admin','admin')",
      [org],
    );
    const content = {
      title: "Live knowledge",
      description: "",
      mode: "assigned",
      release: "manual",
      opensAt: "",
      closesAt: "",
      questions: [
        {
          text: "First question",
          choices: ["One", "Two"],
          correct: 1,
          explanation: "Two is correct",
        },
        {
          text: "Future secret question",
          choices: ["Yes", "No"],
          correct: 0,
          explanation: "Future secret key",
        },
      ],
    };
    let version = 1;
    const saved: any = (
      await learning.command("owner", org, item, crypto.randomUUID(), {
        action: "create",
        content,
      })
    )[0]!.result;
    version = saved.version;
    const published: any = (
      await learning.command("owner", org, item, crypto.randomUUID(), {
        action: "publish",
        version,
      })
    )[0]!.result;
    const base = `https://himmah.test/api/organizations/${org}/learning/${item}/live`;
    const host = async (
      p: Record<string, unknown>,
      rid: string | null = room,
      actor = "owner",
      key = crypto.randomUUID(),
    ) => {
      const response = (await liveStaffApi(
        new Request(base + (rid ? "/" + rid : ""), {
          method: "POST",
          body: JSON.stringify({ key, ...p }),
        }),
        { id: actor, emailVerified: true },
        organizations,
        live,
      ))!;
      return { status: response.status, ...((await response.json()) as any) };
    };
    const createKey = crypto.randomUUID(),
      created = await host(
        { id: room, action: "create", publication: published.publication },
        null,
        "owner",
        createKey,
      );
    assert.equal(created.status, 200);
    assert.match(created.code, /^[A-F0-9]{10}$/);
    assert.deepEqual(
      await host(
        { id: room, action: "create", publication: published.publication },
        null,
        "owner",
        createKey,
      ),
      created,
    );
    assert.equal(
      (
        await host(
          {
            id: crypto.randomUUID(),
            action: "create",
            publication: published.publication,
          },
          null,
          "owner",
          createKey,
        )
      ).status,
      409,
    );
    let phaseVersion = created.version;
    const transition = async (
      action: string,
      extra: Record<string, unknown> = {},
    ) => {
      const r = await host({ action, version: phaseVersion, ...extra });
      if (r.status === 200) phaseVersion = r.version;
      return r;
    };
    assert.equal((await transition("start")).code, "live_empty");
    assert.equal((await transition("reveal")).code, "live_transition");
    const publicBase = `https://himmah.test/api/live/rooms/${created.code}`,
      tokens = ["a".repeat(64), "b".repeat(64), "c".repeat(64)];
    const read = async (token = "") => {
      const r = (await livePublicApi(
        new Request(publicBase, {
          headers: token ? { Cookie: `hl_live=${token}` } : {},
        }),
        live,
      ))!;
      return { status: r.status, ...((await r.json()) as any) };
    };
    const guest = async (
      token: string,
      p: Record<string, unknown>,
      action = "answer",
      key = crypto.randomUUID(),
    ) => {
      const r = (await livePublicApi(
        new Request(publicBase + "/" + action, {
          method: "POST",
          headers: { Cookie: `hl_live=${token}` },
          body: JSON.stringify({
            key,
            ...p,
            ...(action === "join" ? { token } : {}),
          }),
        }),
        live,
      ))!;
      return {
        status: r.status,
        headers: r.headers,
        ...((await r.json()) as any),
      };
    };
    const initial = await read();
    assert.equal(initial.question, undefined);
    assert.equal(initial.player, undefined);
    assert.equal(initial.joined, false);
    const joinKey = crypto.randomUUID(),
      joined = await guest(tokens[0]!, { nickname: "" }, "join", joinKey);
    assert.equal(joined.status, 200);
    assert.match(
      joined.headers.get("set-cookie"),
      /HttpOnly; Secure; SameSite=Strict/,
    );
    assert.match(
      joined.headers.get("set-cookie"),
      new RegExp(`Path=/api/live/rooms/${created.code}`),
    );
    assert.equal(
      (await guest(tokens[0]!, { nickname: "" }, "join", joinKey)).revision,
      1,
    );
    assert.equal(
      (await guest(tokens[1]!, { nickname: "Alex" }, "join")).status,
      200,
    );
    assert.equal(
      (await guest(tokens[2]!, { nickname: "Alex" }, "join")).status,
      200,
    );
    const me = await read(tokens[0]);
    assert.equal(me.player.number, 1);
    assert.equal(me.player.nickname, null);
    assert.equal(me.participants, 3);
    assert.equal(me.question, undefined);
    assert.equal((await read(tokens[1])).player.number, 2);
    const t1 = await transition("start");
    assert.equal(t1.status, 200);
    const open = await read(tokens[0]);
    assert.equal(open.question.text, "First question");
    assert.equal(open.question.correct, undefined);
    assert.equal(open.question.explanation, undefined);
    assert.equal(open.player.score, null);
    assert.ok(!JSON.stringify(open).includes("Future secret"));
    assert.equal(
      (await guest("d".repeat(64), {}, "join")).code,
      "live_started",
    );
    const answerPayload = {
        action: "answer",
        version: phaseVersion,
        revision: open.player.revision,
        question: 0,
        choice: 1,
      },
      answerKey = crypto.randomUUID();
    const answer = await guest(tokens[0]!, answerPayload, "answer", answerKey);
    assert.equal(answer.status, 200);
    assert.equal((await read(tokens[0])).player.choice, 1);
    assert.equal((await read(tokens[1])).player.choice, null);
    assert.equal(
      (
        await guest(
          tokens[0]!,
          { ...answerPayload, choice: 0 },
          "answer",
          answerKey,
        )
      ).status,
      409,
    );
    assert.equal(
      (await guest(tokens[0]!, { ...answerPayload, choice: 0 })).status,
      409,
    );
    assert.equal(
      (await guest(tokens[1]!, { ...answerPayload, revision: 1, choice: 0 }))
        .status,
      200,
    );
    assert.equal((await transition("lock")).status, 200);
    assert.equal((await read(tokens[0])).question.correct, undefined);
    assert.equal(
      (
        await guest(tokens[0]!, {
          ...answerPayload,
          version: phaseVersion,
          revision: answer.revision,
          choice: 0,
        })
      ).code,
      "live_locked",
    );
    assert.equal(
      (await guest(tokens[0]!, answerPayload, "answer", answerKey)).revision,
      answer.revision,
    );
    assert.equal((await transition("reveal")).status, 200);
    const reveal = await read(tokens[0]);
    assert.equal(reveal.question.correct, 1);
    assert.equal(reveal.question.explanation, "Two is correct");
    assert.ok(!JSON.stringify(reveal).includes("Future secret"));
    assert.deepEqual(reveal.summary, []);
    const staffPacket: any = (await live.read("owner", org, item, room))[0]!
      .result;
    assert.equal(staffPacket.answered, 2);
    assert.equal(staffPacket.summary[0].correct, 1);
    assert.deepEqual(staffPacket.distribution, [
      { choice: 0, count: 1 },
      { choice: 1, count: 1 },
    ]);
    // Republish source while the live room keeps the exact original version.
    const latest: any = (
      await learning.command("owner", org, item, crypto.randomUUID(), {
        action: "save",
        version: published.version,
        content: {
          ...content,
          questions: [
            { ...content.questions[0], correct: 0 },
            content.questions[1],
          ],
        },
      })
    )[0]!.result;
    await learning.command("owner", org, item, crypto.randomUUID(), {
      action: "publish",
      version: latest.version,
    });
    assert.equal((await transition("next")).status, 200);
    const second = await read(tokens[0]);
    assert.equal(second.question.text, "Future secret question");
    assert.equal(second.question.correct, undefined);
    assert.equal(
      (
        await guest(tokens[0]!, {
          action: "answer",
          version: phaseVersion,
          revision: answer.revision,
          question: 0,
          choice: 0,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await guest(tokens[0]!, {
          action: "answer",
          version: phaseVersion,
          revision: answer.revision,
          question: 1,
          choice: 0,
        })
      ).status,
      200,
    );
    assert.equal((await transition("lock")).status, 200);
    assert.equal((await transition("reveal")).status, 200);
    assert.equal((await transition("next")).code, "live_transition");
    assert.equal((await transition("finish")).status, 200);
    const final = await read(tokens[0]);
    assert.equal(final.player.score, 2);
    assert.equal(final.played, 2);
    assert.equal((await read(tokens[1])).player.score, 0);
    assert.equal((await read(tokens[2])).player.score, 0);
    assert.equal((await transition("start")).code, "live_closed");
    assert.equal((await guest(tokens[0]!, answerPayload)).code, "live_locked");
    assert.equal(
      (
        await host(
          { action: "finish", version: phaseVersion },
          room,
          "volunteer",
        )
      ).status,
      403,
    );
    assert.equal(
      (await live.read("other", org, item, room))[0]!.result &&
        ((await live.read("other", org, item, room))[0]!.result as any).error,
      "forbidden",
    );
    assert.equal(
      (
        (await live.read("owner", org, crypto.randomUUID(), room))[0]!
          .result as any
      ).error,
      "not_found",
    );
    await assert.rejects(
      db.query("delete from hub_live_answers where room_id=$1", [room]),
      /preserved/,
    );
    await assert.rejects(
      db.query("update hub_live_answers set choice=0 where room_id=$1", [room]),
      /locked/,
    );
    await assert.rejects(
      db.query(
        "update hub_live_rooms set state='lobby',version=version+1 where id=$1",
        [room],
      ),
      /Invalid live transition/,
    );
    const untouched = (
      await db.query<any>(
        "select (select count(*) from hub_attendance)::int as attendance,(select count(*) from hub_cash_receipts)::int as cash,(select count(*) from hub_learning_recipients)::int as assignments",
      )
    ).rows[0];
    assert.deepEqual(untouched, { attendance: 0, cash: 0, assignments: 0 });
    await db.query(
      "delete from hub_memberships where organization_id=$1 and user_id='owner'",
      [org],
    );
    assert.equal(
      (
        await host(
          { id: room, action: "create", publication: published.publication },
          null,
          "owner",
          createKey,
        )
      ).status,
      404,
    );
  } finally {
    await db.close();
  }
});

test("live capacity, expired rooms, removal, early finish and HTTP input limits fail closed without changing other data", async () => {
  const db = new PGlite();
  try {
    await installDatabase(db);
    const org = crypto.randomUUID(),
      item = crypto.randomUUID(),
      publication = crypto.randomUUID(),
      room = crypto.randomUUID(),
      expired = crypto.randomUUID(),
      code = "ABCDEF0123";
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Live fixture','live-cap','Europe/Brussels','owner',gen_random_uuid())",
      [org],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')",
      [org],
    );
    const content = {
      title: "Capacity quiz",
      description: "",
      mode: "open",
      release: "immediate",
      opensAt: "",
      closesAt: "",
      questions: [
        { text: "One?", choices: ["Yes", "No"], correct: 0, explanation: "" },
      ],
    };
    await db.query(
      "insert into hub_learning_items(id,organization_id,title,draft,created_by)values($1,$2,'Capacity quiz',$3,'owner')",
      [item, org, JSON.stringify(content)],
    );
    await db.query(
      "insert into hub_learning_versions(id,organization_id,item_id,number,content)values($1,$2,$3,1,$4)",
      [publication, org, item, JSON.stringify(content)],
    );
    await db.query(
      "insert into hub_live_rooms(id,organization_id,item_id,publication_id,code,created_by,expires_at)values($1,$2,$3,$4,$5,'owner',now()+interval '1 hour')",
      [room, org, item, publication, code],
    );
    await db.query(
      "insert into hub_live_rooms(id,organization_id,item_id,publication_id,code,created_by,created_at,expires_at)values($1,$2,$3,$4,'BADBAD1234','owner','2000-01-01','2000-01-02')",
      [expired, org, item, publication],
    );
    await db.exec(
      `DO $test$ DECLARE r jsonb; BEGIN FOR i IN 1..200 LOOP r:=hub_live_guest('${code}',lpad(to_hex(i),64,'0'),gen_random_uuid(),jsonb_build_object('action','join','nickname',case when i=200 then '100%_' else '' end));IF r?'error' THEN RAISE EXCEPTION 'unexpected capacity join %',r;END IF; END LOOP; END $test$;`,
    );
    let r: any = (
      await db.query<any>(
        "select hub_live_guest($1,$2,gen_random_uuid(),$3) as result",
        [code, "f".repeat(64), JSON.stringify({ action: "join" })],
      )
    ).rows[0]!.result;
    assert.equal(r.error, "live_full");
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int as n from hub_live_players where room_id=$1",
          [room],
        )
      ).rows[0]!.n,
      200,
    );
    const player = (
      await db.query<any>(
        "select id from hub_live_players where room_id=$1 and number=1",
        [room],
      )
    ).rows[0]!.id;
    const removeKey = crypto.randomUUID();
    r = (
      await db.query<any>("select hub_live_host($1,$2,$3,$4,$5,$6) as result", [
        "owner",
        org,
        item,
        room,
        removeKey,
        JSON.stringify({ action: "remove", player, version: 1 }),
      ])
    ).rows[0]!.result;
    assert.equal(r.version, 1);
    const hash = "1".padStart(64, "0");
    assert.equal(
      (
        await db.query<any>("select hub_live_public($1,$2) as result", [
          code,
          hash,
        ])
      ).rows[0]!.result.error,
      "live_revoked",
    );
    assert.equal(
      (
        await db.query<any>(
          "select hub_live_guest($1,$2,gen_random_uuid(),$3) as result",
          [code, hash, JSON.stringify({ action: "join" })],
        )
      ).rows[0]!.result.error,
      "live_revoked",
    );
    await assert.rejects(
      db.query("update hub_live_players set revoked=false where id=$1", [
        player,
      ]),
      /identity/,
    );
    assert.equal(
      (
        await db.query<any>(
          "select hub_live_host($1,$2,$3,$4,gen_random_uuid(),$5) as result",
          [
            "owner",
            org,
            item,
            room,
            JSON.stringify({ action: "finish", version: 1 }),
          ],
        )
      ).rows[0]!.result.version,
      2,
    );
    const final = (
      await db.query<any>("select hub_live_public($1,$2) as result", [
        code,
        "2".padStart(64, "0"),
      ])
    ).rows[0]!.result;
    assert.equal(final.played, 0);
    assert.equal(final.player.score, 0);
    assert.equal(final.question, undefined);
    assert.equal(
      (await db.query<any>("select hub_live_public('BADBAD1234','') as result"))
        .rows[0]!.result.error,
      "live_expired",
    );
    const dialect = new PgDialect(),
      execute = async (s: any) => {
        const q = dialect.sqlToQuery(s);
        return (await db.query<any>(q.sql, q.params)).rows;
      },
      store = createLiveStore(
        "postgres://isolated:only@localhost/himmah",
        execute,
      );
    const organizations = createStore(
      "postgres://isolated:only@localhost/himmah",
      execute,
    );
    const rosterBase = `https://himmah.test/api/organizations/${org}/learning/${item}/live/${room}/players`;
    const list = async (path: string) => {
      const response = (await liveStaffApi(
        new Request(path),
        { id: "owner", emailVerified: true },
        organizations,
        store,
      ))!;
      return { status: response.status, ...((await response.json()) as any) };
    };
    const page = await list(rosterBase),
      all = [...page.items];
    let cursor = page.nextCursor;
    assert.equal(page.items.length, 25);
    while (cursor) {
      const next = await list(
        rosterBase + "?cursor=" + encodeURIComponent(cursor),
      );
      all.push(...next.items);
      cursor = next.nextCursor;
    }
    assert.equal(all.length, 200);
    assert.equal(new Set(all.map((p) => p.id)).size, 200);
    assert.equal(
      all.some((p) => p.revoked),
      true,
    );
    const numeric = await list(rosterBase + "?q=20");
    assert.equal(numeric.items.length, 3);
    const literal = await list(rosterBase + "?q=%25");
    assert.equal(literal.items.length, 1);
    assert.equal(literal.items[0].nickname, "100%_");
    assert.equal(
      (
        await list(
          rosterBase + "?q=20&cursor=" + encodeURIComponent(page.nextCursor),
        )
      ).status,
      400,
    );
    const directory = await list(
      `https://himmah.test/api/organizations/${org}/learning/${item}/live?limit=1`,
    );
    assert.equal(directory.items.length, 1);
    assert.ok(directory.nextCursor);
    assert.equal(
      (
        await list(
          `https://himmah.test/api/organizations/${org}/learning/${item}/live?cursor=${encodeURIComponent(page.nextCursor)}`,
        )
      ).status,
      400,
    );
    for (const [body, endpoint] of [
      [{ key: crypto.randomUUID(), token: "short" }, "join"],
      [
        {
          key: crypto.randomUUID(),
          token: "a".repeat(64),
          nickname: "x".repeat(41),
        },
        "join",
      ],
      [
        {
          key: crypto.randomUUID(),
          action: "answer",
          version: 2,
          revision: 1,
          question: 0,
          choice: 99,
        },
        "answer",
      ],
    ]) {
      const response = (await livePublicApi(
        new Request(`https://himmah.test/api/live/rooms/${code}/${endpoint}`, {
          method: "POST",
          headers: { Cookie: "hl_live=" + "a".repeat(64) },
          body: JSON.stringify(body),
        }),
        store,
      ))!;
      assert.equal(response.status, 400);
    }
    const unknownCookie = (await livePublicApi(
      new Request(`https://himmah.test/api/live/rooms/${code}`, {
        headers: { Cookie: "hl_live=short" },
      }),
      store,
    ))!;
    assert.equal(unknownCookie.status, 403);
    const noCookie = (await livePublicApi(
      new Request(`https://himmah.test/api/live/rooms/${code}/answer`, {
        method: "POST",
        body: JSON.stringify({ key: crypto.randomUUID() }),
      }),
      store,
    ))!;
    assert.equal(noCookie.status, 404);
  } finally {
    await db.close();
  }
});
