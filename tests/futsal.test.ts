import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  makeFutsalPlan,
  validateSettings,
  trainingBenefit,
  type FutsalSettings,
  type Opponent,
} from "../src/domain/futsal-setup.ts";
import {
  defaultSettings,
  futsalCalendar,
  seasonInput,
  type FutsalSeason,
} from "../src/futsal/contracts.ts";
import { createFutsalStore } from "../src/server/futsal-store.ts";
import { createStore } from "../src/server/store.ts";
import { futsalApi } from "../src/server/futsal-api.ts";
import { pageInput, pageResult } from "../src/community/contracts.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const settings = (change: Partial<FutsalSettings> = {}): FutsalSettings => ({
  ...defaultSettings("UTC"),
  preparationStartsAt: "2099-01-01T00:00:00.000Z",
  startsAt: "2099-01-15T20:00:00.000Z",
  endsAt: "2099-06-01T20:00:00.000Z",
  roundEveryDays: 2,
  ...change,
});
test("all four mode/format combinations produce deterministic round robins and valid knockout byes for 2–16 entries", () => {
  for (const mode of ["club_manager", "team_league"] as const)
    for (const format of ["league", "tournament"] as const)
      for (let n = 2; n <= 16; n++)
        for (const legs of format === "league" ? [1, 2] : [1]) {
          const s = settings({
              mode,
              format,
              entryCount: n,
              legs,
              playersPerTeam: mode === "club_manager" ? 1 : 3,
              squadSize: mode === "club_manager" ? 7 : 5,
            }),
            ids = Array.from({ length: n }, (_, i) => "entry-" + i),
            plan = makeFutsalPlan(s, ids, "saved-seed", futsalCalendar("UTC"));
          assert.deepEqual(
            plan,
            makeFutsalPlan(s, ids, "saved-seed", futsalCalendar("UTC")),
          );
          assert.ok(
            plan.trainingAt.length > 0 && plan.trainingAt.length <= 128,
          );
          assert.ok(
            plan.trainingAt.every(
              (at) =>
                Date.parse(at) >= Date.parse(s.preparationStartsAt) &&
                Date.parse(at) < Date.parse(plan.rounds.at(-1)!.at),
            ),
          );
          if (format === "league") {
            const pairs = new Map<string, number>();
            const homeCounts = new Map(ids.map((id) => [id, 0]));
            for (const round of plan.rounds) {
              const seen = new Set<string>();
              for (const m of round.matches) {
                assert.ok("entryId" in m.home);
                const home = (m.home as { entryId: string }).entryId;
                assert.ok(!seen.has(home));
                seen.add(home);
                if (m.away) {
                  assert.ok("entryId" in m.away);
                  const away = (m.away as { entryId: string }).entryId;
                  assert.ok(!seen.has(away));
                  seen.add(away);
                  homeCounts.set(home, homeCounts.get(home)! + 1);
                  const key = [home, away].sort().join(":");
                  pairs.set(key, (pairs.get(key) ?? 0) + 1);
                }
              }
              assert.equal(seen.size, n);
            }
            assert.equal(pairs.size, (n * (n - 1)) / 2);
            assert.ok(
              Math.max(...homeCounts.values()) -
                Math.min(...homeCounts.values()) <=
                1,
            );
            assert.ok([...pairs.values()].every((count) => count === legs));
            assert.equal(plan.matchCount, ((n * (n - 1)) / 2) * legs);
          } else {
            assert.equal(plan.matchCount, n - 1);
            assert.equal(plan.byeCount, 2 ** Math.ceil(Math.log2(n)) - n);
            const winners = new Map<string, string>(),
              defeated = new Set<string>();
            const resolve = (o: Opponent) =>
              "entryId" in o ? o.entryId : winners.get(o.winnerOf)!;
            for (const round of plan.rounds)
              for (const m of round.matches) {
                const home = resolve(m.home);
                assert.ok(ids.includes(home));
                if (m.away) {
                  const away = resolve(m.away);
                  assert.ok(ids.includes(away));
                  assert.notEqual(home, away);
                  assert.ok(!defeated.has(home) && !defeated.has(away));
                  defeated.add(away);
                }
                winners.set(m.id, home);
              }
            assert.equal(defeated.size, n - 1);
            assert.equal(plan.rounds.at(-1)!.matches.length, 1);
          }
        }
});
test("calendar follows local timezone through DST, rejects impossible settings and caps source-independent training previews", () => {
  const s = settings({
      timezone: "Europe/Brussels",
      preparationStartsAt: "2027-03-10T00:00:00.000Z",
      startsAt: "2027-03-20T19:00:00.000Z",
      endsAt: "2027-05-01T00:00:00.000Z",
      roundEveryDays: 7,
    }),
    calendar = futsalCalendar(s.timezone),
    plan = makeFutsalPlan(s, ["a", "b", "c", "d"], "seed", calendar);
  assert.ok(plan.rounds.every((r) => calendar.local(r.at).endsWith("20:00")));
  assert.equal(
    Date.parse(plan.rounds[2]!.at) - Date.parse(plan.rounds[1]!.at),
    7 * 86400000 - 3600000,
  );
  for (const change of [
    { entryCount: 1 },
    { playersPerTeam: 6 },
    { startingRating: 90 },
    { baseGrowth: 2, bonusGrowth: 2 },
    { winPoints: 1, drawPoints: 2 },
    { chanceStep: 10, chanceCap: 5 },
    { mode: "bad" },
    { schemaVersion: 2 },
    { timezone: "nonsense" },
  ])
    assert.throws(() => validateSettings({ ...settings(), ...change }));
  assert.throws(() =>
    makeFutsalPlan(
      settings({ endsAt: "2099-01-16T20:00:00.000Z" }),
      ["a", "b", "c", "d"],
      "s",
      futsalCalendar("UTC"),
    ),
  );
  const raw = {
    name: "Season",
    description: "",
    prizeCriteria: "",
    settings: {
      ...settings(),
      preparationLocal: "2026-10-20T20:00",
      startLocal: "2026-10-25T02:30",
      endLocal: "2026-11-20T20:00",
    },
  };
  assert.throws(() => seasonInput(raw, "Europe/Brussels"));
  assert.equal(trainingBenefit(-100, settings()).bonusChance, 0);
  assert.equal(trainingBenefit(10, settings()).bonusChance, 5);
  assert.equal(trainingBenefit(99999, settings()).bonusChance, 30);
  assert.equal(trainingBenefit(99999, settings()).maximumGrowth, 2);
  assert.throws(() => trainingBenefit(NaN, settings()));
});
test("PostgreSQL Futsal setup: atomic drafts, entries, authorization, immutable snapshots, exact receipts, audit rollback and independent organizations", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../db/migrations/generated/", import.meta.url),
      journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", dir), "utf8"),
      );
    for (const e of journal.entries)
      await db.exec(await readFile(new URL(e.tag + ".sql", dir), "utf8"));
    await db.query(
      `insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Organization A','org-a','UTC','owner',$3),($2,'Organization B','org-b','UTC','other',$4)`,
      [org, other, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      `insert into hub_memberships(organization_id,user_id,role) values($1,'owner','owner'),($1,'admin','admin'),($1,'vol','volunteer'),($2,'other','owner')`,
      [org, other],
    );
    const people = Array.from({ length: 8 }, () => crypto.randomUUID());
    for (const [i, id] of people.entries())
      await db.query(
        `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,$3,'owner',$4,'owner')`,
        [id, org, "Member " + i, crypto.randomUUID()],
      );
    const foreign = crypto.randomUUID();
    await db.query(
      `insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,'Foreign','other',$3,'other')`,
      [foreign, other, crypto.randomUUID()],
    );
    const dialect = new PgDialect(),
      execute = async (st: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query(q.sql, q.params)).rows as Record<
          string,
          unknown
        >[];
      },
      url = "postgresql://test:test@localhost/test",
      store = createFutsalStore(url, execute),
      organizations = createStore(url, execute);
    const result = (r: Record<string, unknown>[]) =>
      r[0]!.result as { id?: string; entryId?: string; code?: string };
    const create = {
      operation: "save",
      name: "First season",
      description: "Independent setup",
      prizeCriteria: "Teamwork",
      settings: settings({
        entryCount: 2,
        mode: "club_manager",
        playersPerTeam: 1,
        squadSize: 7,
      }),
    };
    const key = crypto.randomUUID(),
      created = await Promise.all([
        store.command("owner", org, null, null, key, create),
        store.command("owner", org, null, null, key, create),
      ]),
      id = result(created[0]!).id!;
    assert.equal(result(created[1]!).id, id);
    assert.equal(
      result(await store.command("admin", org, null, null, key, create)).code,
      "conflict",
    );
    assert.equal(
      result(
        await store.command(
          "vol",
          org,
          null,
          null,
          crypto.randomUUID(),
          create,
        ),
      ).code,
      "forbidden",
    );
    assert.equal(
      result(
        await store.command("owner", org, null, null, crypto.randomUUID(), {
          ...create,
          settings: { ...create.settings, entryCount: 999 },
        }),
      ).code,
      "invalid_input",
    );
    assert.equal((await store.get("other", org, id)).length, 0);
    assert.equal((await store.get("other", other, id)).length, 0);
    let season = (await store.get("owner", org, id))[0] as FutsalSeason;
    const add = {
        operation: "entry",
        version: season.version,
        name: "First club",
        members: [people[0]],
      },
      addKey = crypto.randomUUID();
    const entry = result(
      await store.command("owner", org, id, null, addKey, add),
    ).entryId!;
    assert.equal(
      result(await store.command("owner", org, id, null, addKey, add)).entryId,
      entry,
    );
    season = (await store.get("owner", org, id))[0] as FutsalSeason;
    assert.equal(
      result(
        await store.command("owner", org, id, null, crypto.randomUUID(), {
          ...add,
          version: season.version,
          members: [people[0]],
        }),
      ).code,
      "futsal_assigned",
    );
    assert.equal(
      result(
        await store.command("owner", org, id, null, crypto.randomUUID(), {
          ...add,
          version: season.version,
          members: [foreign],
        }),
      ).code,
      "futsal_member",
    );
    const second = result(
      await store.command("owner", org, id, null, crypto.randomUUID(), {
        ...add,
        version: season.version,
        name: "Second club",
        members: [people[1]],
      }),
    ).entryId!;
    season = (await store.get("owner", org, id))[0] as FutsalSeason;
    assert.equal(
      result(
        await store.command("owner", org, id, entry, crypto.randomUUID(), {
          operation: "entry",
          version: season.version,
          name: "Changed",
          members: [people[1]],
        }),
      ).code,
      "futsal_assigned",
    );
    assert.equal(
      (await store.entries("owner", org, id)).find((e) => e.id === entry)?.name,
      "First club",
    );
    assert.equal(
      result(
        await store.command("owner", org, id, null, crypto.randomUUID(), {
          ...create,
          version: season.version,
          settings: settings({ entryCount: 2 }),
        }),
      ).code,
      "futsal_roster_change",
    );
    const page = pageInput(
        new URL("https://test.invalid?limit=1"),
        `owner:${org}/entries`,
      ),
      firstPage = pageResult(
        (await store.entries("owner", org, id, page)) as {
          id: string;
          createdAt: string;
        }[],
        page,
      );
    assert.ok(firstPage.nextCursor);
    assert.equal(
      (
        await store.entries(
          "owner",
          org,
          id,
          pageInput(
            new URL(
              "https://test.invalid?limit=1&cursor=" +
                encodeURIComponent(firstPage.nextCursor!),
            ),
            `owner:${org}/entries`,
          ),
        )
      ).length,
      1,
    );
    const personPage = pageInput(
      new URL("https://test.invalid?limit=1"),
      `owner:${org}/candidates`,
    );
    assert.equal(
      (await store.candidates("owner", org, id, personPage)).length,
      2,
    );
    const user = { id: "owner", emailVerified: true };
    const call = (
      path: string,
      actor = user,
      method = "GET",
      body: unknown = undefined,
    ) =>
      futsalApi(
        new Request("https://test.invalid" + path, {
          method,
          ...(body
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        }),
        actor,
        organizations,
        store,
      );
    assert.equal(
      (
        await call(`/api/organizations/${org}/futsal/seasons`, {
          id: "vol",
          emailVerified: true,
        })
      )?.status,
      403,
    );
    assert.equal(
      (
        await call(`/api/organizations/${org}/futsal/seasons`, {
          ...user,
          emailVerified: false,
        })
      )?.status,
      403,
    );
    assert.equal(
      (await call(`/api/organizations/${other}/futsal/seasons/${id}`))?.status,
      404,
    );
    const preview = await (await call(
      `/api/organizations/${org}/futsal/seasons/${id}/preview`,
    ))!.json();
    assert.equal(preview.ready, true);
    assert.equal(preview.plan.matchCount, 1);
    const prepareKey = crypto.randomUUID(),
      prepare = { key: prepareKey, version: season.version };
    const prepared = await call(
      `/api/organizations/${org}/futsal/seasons/${id}/prepare`,
      user,
      "POST",
      prepare,
    );
    assert.equal(prepared?.status, 200);
    assert.equal(
      (
        await call(
          `/api/organizations/${org}/futsal/seasons/${id}/prepare`,
          user,
          "POST",
          prepare,
        )
      )?.status,
      200,
    );
    season = (await store.get("owner", org, id))[0] as FutsalSeason;
    assert.equal(season.status, "prepared");
    assert.deepEqual(season.snapshot?.plan, preview.plan);
    assert.equal(season.snapshot?.entries.length, 2);
    const savedSnapshot = structuredClone(season.snapshot);
    assert.equal(
      result(
        await store.command("owner", org, id, null, crypto.randomUUID(), {
          ...create,
          version: season.version,
        }),
      ).code,
      "futsal_locked",
    );
    assert.equal(
      result(
        await store.command("owner", org, id, second, crypto.randomUUID(), {
          operation: "remove_entry",
          version: season.version,
        }),
      ).code,
      "futsal_locked",
    );
    await assert.rejects(() =>
      db.query(
        `update futsal_seasons set settings=$1,version=version+1 where id=$2`,
        [JSON.stringify(settings()), id],
      ),
    );
    await assert.rejects(() =>
      db.query("delete from futsal_entries where id=$1", [entry]),
    );
    await assert.rejects(() =>
      db.query("delete from futsal_entry_members where entry_id=$1", [entry]),
    );
    await db.query(
      `update hub_people set name='New nickname',version=version+1 where id=$1`,
      [people[0]],
    );
    assert.deepEqual(
      ((await store.get("owner", org, id))[0] as FutsalSeason).snapshot,
      savedSnapshot,
    );
    assert.equal(
      JSON.stringify(await store.entries("owner", org, id)).includes(
        "New nickname",
      ),
      false,
    );
    assert.ok(
      result(
        await store.command("owner", org, id, null, crypto.randomUUID(), {
          operation: "cancel",
          version: season.version,
          reason: "New season planned",
        }),
      ).id,
    );
    assert.deepEqual(
      ((await store.get("owner", org, id))[0] as FutsalSeason).snapshot,
      savedSnapshot,
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from hub_points_entries",
        )
      ).rows[0]!.count,
      0,
    );

    // Persist and lock all four combinations through the actual API with three entries.
    for (const mode of ["club_manager", "team_league"] as const)
      for (const format of ["league", "tournament"] as const) {
        const config = settings({
          mode,
          format,
          entryCount: 3,
          playersPerTeam: mode === "club_manager" ? 1 : 2,
          squadSize: mode === "club_manager" ? 7 : 5,
        });
        const createdResponse = await call(
          `/api/organizations/${org}/futsal/seasons`,
          user,
          "POST",
          {
            key: crypto.randomUUID(),
            name: `${mode} ${format}`,
            description: "",
            prizeCriteria: "",
            settings: {
              ...config,
              preparationLocal: "2099-01-01T00:00",
              startLocal: "2099-01-15T20:00",
              endLocal: "2099-06-01T20:00",
            },
          },
        );
        assert.equal(createdResponse?.status, 201);
        const comboId = (await createdResponse!.json()).item.id as string;
        for (let i = 0; i < 3; i++) {
          const current = (await store.get("owner", org, comboId))[0]!;
          const response = await call(
            `/api/organizations/${org}/futsal/seasons/${comboId}/entries`,
            user,
            "POST",
            {
              key: crypto.randomUUID(),
              version: current.version,
              name: "Entry " + i,
              members: people.slice(
                i * config.playersPerTeam,
                (i + 1) * config.playersPerTeam,
              ),
            },
          );
          assert.equal(response?.status, 200);
        }
        const expected = (await store.get("owner", org, comboId))[0]!;
        const response = await call(
          `/api/organizations/${org}/futsal/seasons/${comboId}/prepare`,
          user,
          "POST",
          { key: crypto.randomUUID(), version: expected.version },
        );
        assert.equal(response?.status, 200);
        const complete = (
          await store.get("owner", org, comboId)
        )[0] as FutsalSeason;
        assert.equal(complete.status, "prepared");
        assert.equal(complete.snapshot!.settings.mode, mode);
        assert.equal(complete.snapshot!.settings.format, format);
        assert.equal(
          complete.snapshot!.plan.matchCount,
          format === "league" ? 3 : 2,
        );
        assert.equal(
          complete.snapshot!.entries.every(
            (e) => e.members.length === config.playersPerTeam,
          ),
          true,
        );
      }
    // A failed audit rolls back the season, roster and receipt together.
    const draft = result(
      await store.command(
        "owner",
        org,
        null,
        null,
        crypto.randomUUID(),
        create,
      ),
    ).id!;
    await db.exec(
      `create function fail_futsal_audit() returns trigger language plpgsql as $$ begin if NEW.action='entry' then raise exception 'injected'; end if; return NEW; end $$; create trigger fail_futsal_audit before insert on futsal_events for each row execute function fail_futsal_audit();`,
    );
    const failingKey = crypto.randomUUID();
    await assert.rejects(() =>
      store.command("owner", org, draft, null, failingKey, {
        ...add,
        version: 1,
      }),
    );
    assert.equal((await store.entries("owner", org, draft)).length, 0);
    assert.equal((await store.get("owner", org, draft))[0]!.version, 1);
    assert.equal(
      (
        await db.query("select 1 from futsal_requests where request_key=$1", [
          failingKey,
        ])
      ).rows.length,
      0,
    );
    await db.exec("drop trigger fail_futsal_audit on futsal_events");
    // The same participant may enter another season, but cannot enter twice in one season.
    assert.ok(
      result(
        await store.command("owner", org, draft, null, crypto.randomUUID(), {
          ...add,
          version: 1,
        }),
      ).entryId,
    );
    const versions = (await store.get("owner", org, draft))[0]!.version;
    const competing = await Promise.all([
      store.command("owner", org, draft, null, crypto.randomUUID(), {
        ...create,
        version: versions,
        name: "Edit A",
      }),
      store.command("admin", org, draft, null, crypto.randomUUID(), {
        ...create,
        version: versions,
        name: "Edit B",
      }),
    ]);
    assert.equal(competing.filter((r) => result(r).id).length, 1);
    await db.query(
      `update hub_memberships set role='volunteer' where organization_id=$1 and user_id='owner'`,
      [org],
    );
    assert.equal(
      result(await store.command("owner", org, null, null, key, create)).code,
      "forbidden",
    );
    assert.equal((await store.get("owner", org, id)).length, 0);
  } finally {
    await db.close();
  }
});
