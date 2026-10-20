import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  activateGame,
  advanceGame,
  gameSlots,
  gameStandings,
  type GameSnapshot,
  type GamePoints,
  type GameState,
} from "../src/domain/futsal-game.ts";
import {
  defaultSettings,
  seasonPlan,
  type FutsalSeason,
} from "../src/futsal/contracts.ts";
import { createFutsalStore } from "../src/server/futsal-store.ts";
import { createFutsalGameStore } from "../src/server/futsal-game-store.ts";
import { createStore } from "../src/server/store.ts";
import { futsalGameApi } from "../src/server/futsal-game-api.ts";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
function snapshot(
  mode: "club_manager" | "team_league",
  format: "league" | "tournament",
  count = 4,
): GameSnapshot {
  const settings = {
    ...defaultSettings("UTC"),
    mode,
    format,
    entryCount: count,
    playersPerTeam: mode === "club_manager" ? 1 : 3,
    squadSize: mode === "club_manager" ? 7 : 5,
    preparationStartsAt: "2099-01-01T00:00:00.000Z",
    startsAt: "2099-01-15T20:00:00.000Z",
    endsAt: "2099-06-01T20:00:00.000Z",
    roundEveryDays: 2,
  };
  const entries = Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    name: "Team " + (i + 1),
    members: Array.from({ length: settings.playersPerTeam }, (_, j) => ({
      id: crypto.randomUUID(),
      name: `Test ${i}-${j}`,
    })),
  }));
  return {
    settings,
    entries,
    plan: seasonPlan(
      settings,
      entries.map((e) => e.id),
      "fixed-seed",
    ),
  };
}
test("complete reproducible seasons in both modes/formats, odd/even byes, capped growth, fixed fillers and correct standings", () => {
  for (const mode of ["club_manager", "team_league"] as const)
    for (const format of ["league", "tournament"] as const)
      for (const count of [2, 3, 4, 5, 16]) {
        const saved = snapshot(mode, format, count),
          initial = activateGame(saved),
          allocations: GamePoints = Object.fromEntries(
            saved.entries.flatMap((e) =>
              e.members.map((p) => [p.id, { points: 10000, eligible: true }]),
            ),
          );
        assert.ok(
          initial.entries.every((e) =>
            e.players.every(
              (p) => p.attack === 50 && p.defence === 50 && p.control === 50,
            ),
          ),
        );
        let state = initial,
          trainings = 0;
        while (state.status === "active") {
          const first = advanceGame(saved, state, "fixed-seed", allocations);
          assert.deepEqual(
            first,
            advanceGame(saved, state, "fixed-seed", allocations),
          );
          assert.deepEqual(
            state,
            state === initial ? initial : structuredClone(state),
          );
          for (const g of first.event.growth) {
            assert.ok(g.after - g.before <= saved.settings.maxGrowth);
            assert.ok(g.chance <= 30);
            assert.ok(g.after <= 90);
          }
          if (first.event.kind === "training") trainings++;
          state = first.state;
        }
        assert.equal(
          state.results.filter((r) => r.away).length,
          saved.plan.matchCount,
        );
        assert.equal(state.step, gameSlots(saved).length);
        if (mode === "team_league")
          assert.ok(
            state.entries.every((e) =>
              e.players
                .slice(3)
                .every(
                  (p) =>
                    p.attack === 50 && p.defence === 50 && p.control === 50,
                ),
            ),
          );
        if (format === "league") {
          const table = gameStandings(state, saved.settings);
          assert.ok(table.every((r) => r.played === count - 1));
          assert.equal(
            table.reduce((n, r) => n + r.goalsFor, 0),
            table.reduce((n, r) => n + r.goalsAgainst, 0),
          );
        } else {
          assert.ok(state.results.at(-1)!.winner);
          assert.equal(state.results.filter((r) => r.away).length, count - 1);
        }
        assert.ok(trainings > 0);
        assert.throws(() =>
          advanceGame(saved, state, "fixed-seed", allocations),
        );
      }
});
test("point-scale equivalence, ineligible participants, growth caps and no mutation of prior state", () => {
  const saved = snapshot("team_league", "league"),
    base = activateGame(saved),
    points = Object.fromEntries(
      saved.entries.flatMap((e) =>
        e.members.map((p) => [p.id, { points: 30, eligible: true }]),
      ),
    );
  const original = structuredClone(base),
    a = advanceGame(saved, base, "seed", points);
  const scaled = structuredClone(saved);
  scaled.settings.pointsPerStep *= 10;
  const b = advanceGame(
    scaled,
    base,
    "seed",
    Object.fromEntries(
      Object.entries(points).map(([id, p]) => [id, { ...p, points: 300 }]),
    ),
  );
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(base, original);
  const none = advanceGame(saved, base, "seed", {});
  assert.equal(none.event.growth.length, 0);
  assert.deepEqual(none.state.entries, base.entries);
  const near = structuredClone(base);
  near.entries.forEach((e) =>
    e.players.forEach((p) => {
      p.attack = 90;
      p.defence = 90;
      p.control = 90;
    }),
  );
  assert.ok(
    advanceGame(saved, near, "seed", points).event.growth.every(
      (g) => g.after === 90,
    ),
  );
});
test("real SQL/API fast-forward: all four complete seasons, clock gates, exact receipts, scope, immutable history and no Hub spending", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../db/migrations/generated/", import.meta.url),
      journal = JSON.parse(
        await readFile(new URL("meta/_journal.json", dir), "utf8"),
      );
    for (const m of journal.entries)
      await db.exec(await readFile(new URL(m.tag + ".sql", dir), "utf8"));
    // This clock replacement exists ONLY inside this disposable in-memory database. No HTTP clock override exists.
    await db.exec(
      "CREATE OR REPLACE FUNCTION futsal_game_now() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$ SELECT current_setting('himmah.test_clock')::timestamptz $$; SET himmah.test_clock='2099-01-01T00:00:00Z';",
    );
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key) values($1,'Test org','test-game','UTC','owner',$3),($2,'Other','other-game','UTC','other',$4)",
      [org, other, crypto.randomUUID(), crypto.randomUUID()],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role) values($1,'owner','owner'),($1,'admin','admin'),($1,'vol','volunteer'),($2,'other','owner')",
      [org, other],
    );
    const dialect = new PgDialect(),
      execute = async (st: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const q = dialect.sqlToQuery(st);
        return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
      },
      url = "postgresql://test:test@localhost/test",
      seasons = createFutsalStore(url, execute),
      games = createFutsalGameStore(url, execute),
      organizations = createStore(url, execute);
    const call = (
      id: string,
      part = "",
      body: unknown = undefined,
      actor = "owner",
      tenant = org,
    ) =>
      futsalGameApi(
        new Request(
          `https://test.invalid/api/organizations/${tenant}/futsal/seasons/${id}/game${part ? "/" + part : ""}`,
          {
            method: body ? "POST" : "GET",
            ...(body
              ? {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                }
              : {}),
          },
        ),
        { id: actor, emailVerified: true },
        organizations,
        seasons,
        games,
      );
    const summary = [];
    for (const mode of ["club_manager", "team_league"] as const)
      for (const format of ["league", "tournament"] as const) {
        const saved = snapshot(mode, format, 4);
        for (const e of saved.entries)
          for (const p of e.members)
            await db.query(
              "insert into hub_people(id,organization_id,name,created_by,creation_key,consent_recorded_by) values($1,$2,$3,'owner',$4,'owner')",
              [p.id, org, p.name, crypto.randomUUID()],
            );
        const created = (
          await seasons.command("owner", org, null, null, crypto.randomUUID(), {
            operation: "save",
            name: `${mode} ${format}`,
            description: "",
            prizeCriteria: "",
            settings: saved.settings,
          })
        )[0]!.result as { id: string };
        const id = created.id;
        assert.ok(id);
        for (const e of saved.entries) {
          const current = (
            await seasons.get("owner", org, id)
          )[0] as FutsalSeason;
          assert.ok(
            (
              await seasons.command(
                "owner",
                org,
                id,
                null,
                crypto.randomUUID(),
                {
                  operation: "entry",
                  version: current.version,
                  name: e.name,
                  members: e.members.map((p) => p.id),
                },
              )
            )[0]!.result,
          );
        }
        const current = (
            await seasons.get("owner", org, id)
          )[0] as FutsalSeason,
          entrants = (await seasons.entries("owner", org, id)).sort(
            (a, b) =>
              Date.parse(String(a.createdAt)) -
                Date.parse(String(b.createdAt)) ||
              String(a.id).localeCompare(String(b.id)),
          );
        const plan = seasonPlan(
          current.settings,
          entrants.map((e) => String(e.id)),
          current.seed,
        );
        assert.ok(
          (
            (
              await seasons.command(
                "owner",
                org,
                id,
                null,
                crypto.randomUUID(),
                { operation: "prepare", version: current.version, plan },
              )
            )[0]!.result as { id?: string }
          ).id,
        );
        const key = crypto.randomUUID(),
          activate = { key, version: 0 };
        assert.equal((await call(id, "activate", activate))?.status, 200);
        assert.equal((await call(id, "activate", activate))?.status, 200);
        assert.equal(
          (await call(id, "activate", activate, "vol"))?.status,
          403,
        );
        assert.equal(
          (await call(id, "", undefined, "other", other))?.status,
          404,
        );
        await db.exec("SET himmah.test_clock='2099-01-01T00:00:00Z'");
        assert.equal(
          (await call(id, "advance", { key: crypto.randomUUID(), version: 1 }))
            ?.status,
          409,
        );
        let game = (await games.get("owner", org, id))[0] as {
          state: GameState;
          version: number;
        };
        const prepared = (
          await seasons.get("owner", org, id)
        )[0] as FutsalSeason;
        // Synthetic normalized ledger awards, including a correction before cutoff and a late award.
        const person = saved.entries[0]!.members[0]!.id,
          requestId = crypto.randomUUID(),
          awardId = crypto.randomUUID();
        await db.query(
          "insert into hub_points_requests(id,organization_id,request_key,actor_id,payload,response) values($1,$2,$3,'owner','{}','{}')",
          [requestId, org, crypto.randomUUID()],
        );
        await db.query(
          "insert into hub_points_entries(id,organization_id,person_id,request_id,actor_id,amount,reason,occurred_at,created_at) values($1,$2,$3,$4,'owner',60,'Synthetic engagement','2099-01-01T10:00Z','2099-01-01T11:00Z')",
          [awardId, org, person, requestId],
        );
        const cutoff = prepared.snapshot!.plan.trainingAt[0]!;
        const insertExtra = async (
          amount: number,
          createdAt: string,
          original: string | null,
        ) => {
          const request = crypto.randomUUID();
          await db.query(
            "insert into hub_points_requests(id,organization_id,request_key,actor_id,payload,response) values($1,$2,$3,'owner','{}','{}')",
            [request, org, crypto.randomUUID()],
          );
          await db.query(
            "insert into hub_points_entries(organization_id,person_id,request_id,actor_id,amount,reason,original_id,occurred_at,created_at) values($1,$2,$3,'owner',$4,'Synthetic correction',$5,'2099-01-01T10:00Z',$6)",
            [org, person, request, amount, original, createdAt],
          );
        };
        await insertExtra(-30, "2099-01-01T12:00Z", awardId);
        await insertExtra(
          500,
          new Date(Date.parse(cutoff) + 1000).toISOString(),
          null,
        );
        const allocation = (await games.points("owner", org, id, 0))[0]!
          .points as GamePoints;
        assert.equal(allocation[person]!.points, 30);
        assert.equal(
          ((await games.points("owner", org, id, 1))[0]!.points as GamePoints)[
            person
          ]!.points,
          500,
        );
        const before = (
          await db.query<{ n: string }>(
            "select sum(amount)::text as n from hub_points_entries",
          )
        ).rows[0]!.n;
        while (game.state.status === "active") {
          const next = gameSlots(prepared.snapshot!)[game.state.step]!;
          await db.query("select set_config('himmah.test_clock',$1,false)", [
            next.at,
          ]);
          const body = { key: crypto.randomUUID(), version: game.version };
          if (
            mode === "club_manager" &&
            format === "league" &&
            game.state.step === 0
          ) {
            await db.exec(
              "create function fail_game_audit() returns trigger language plpgsql as $$ begin raise exception 'injected audit failure'; end $$; create trigger fail_game_audit before insert on futsal_game_events for each row execute function fail_game_audit()",
            );
            assert.equal((await call(id, "advance", body))?.status, 503);
            assert.deepEqual(
              (await games.get("owner", org, id))[0]!.state,
              game.state,
            );
            await db.exec("drop trigger fail_game_audit on futsal_game_events");
          }

          const raced = await Promise.all([
            call(id, "advance", body),
            call(id, "advance", body),
          ]);
          assert.ok(raced.every((r) => r?.status === 200));
          const after = (await games.get("owner", org, id))[0] as typeof game;
          assert.equal((await call(id, "advance", body))?.status, 200);
          assert.deepEqual(
            (await games.get("owner", org, id))[0]!.state,
            after.state,
          );
          assert.equal(
            (await call(id, "advance", { ...body, key: crypto.randomUUID() }))
              ?.status,
            409,
          );
          game = after;
        }
        assert.equal(
          game.state.results.filter((r) => r.away).length,
          prepared.snapshot!.plan.matchCount,
        );
        assert.equal(
          (
            await db.query<{ n: string }>(
              "select sum(amount)::text as n from hub_points_entries",
            )
          ).rows[0]!.n,
          before,
        );
        const page = await futsalGameApi(
          new Request(
            `https://test.invalid/api/organizations/${org}/futsal/seasons/${id}/game/events?limit=1`,
          ),
          { id: "owner", emailVerified: true },
          organizations,
          seasons,
          games,
        );
        assert.equal(page?.status, 200);
        const body = await page!.json();
        assert.equal(body.items.length, 1);
        assert.ok(body.nextCursor);
        await assert.rejects(
          db.query(
            "update futsal_games set version=version+1 where organization_id=$1 and season_id=$2",
            [org, id],
          ),
        );
        await assert.rejects(
          db.query(
            "delete from futsal_game_events where organization_id=$1 and season_id=$2",
            [org, id],
          ),
        );
        await db.query(
          "update hub_memberships set role='volunteer' where organization_id=$1 and user_id='admin'",
          [org],
        );
        assert.equal((await call(id, "", undefined, "admin"))?.status, 403);
        const participant = "player-" + mode + "-" + format,
          invitation = crypto.randomUUID();
        await db.query(
          "insert into hub_participant_invitations(id,organization_id,person_id,email,token_hash,created_by,creation_key,expires_at) values($1,$2,$3,$4,$5,'owner',$6,'2100-01-01Z')",
          [
            invitation,
            org,
            person,
            participant + "@example.invalid",
            crypto.randomUUID().replaceAll("-", "").repeat(2),
            crypto.randomUUID(),
          ],
        );
        await db.query(
          "insert into hub_participant_links(organization_id,person_id,user_id,invitation_id) values($1,$2,$3,$4)",
          [org, person, participant, invitation],
        );
        const play = (suffix = "", actor = participant, method = "GET") =>
          futsalGameApi(
            new Request(
              `https://test.invalid/api/organizations/${org}/futsal/play${suffix}`,
              { method },
            ),
            { id: actor, emailVerified: true },
            organizations,
            seasons,
            games,
          );
        const own = await play("/" + id);
        assert.equal(own?.status, 200);
        const ownText = await own!.text();
        assert.ok(!ownText.includes(person));
        assert.ok(!ownText.includes("bonusChance"));
        assert.ok(!ownText.includes('"seed":'));
        assert.equal((await play("/" + id, "other"))?.status, 404);
        assert.equal((await play("/" + id, participant, "POST"))?.status, 403);
        assert.equal(
          (await call(id, "events", undefined, participant))?.status,
          403,
        );
        const ownList = await (await play())!.json();
        assert.equal(ownList.items.length, 1);
        await db.query(
          "update hub_people set archived=true,version=version+1 where organization_id=$1 and id=$2",
          [org, person],
        );
        assert.equal((await play("/" + id))?.status, 404);
        assert.equal(
          ((await games.points("owner", org, id, 0))[0]!.points as GamePoints)[
            person
          ]!.eligible,
          false,
        );
        await db.query(
          "update hub_people set archived=false,version=version+1 where organization_id=$1 and id=$2",
          [org, person],
        );
        await assert.rejects(
          db.query(
            "update hub_participant_links set revoked_at=now(),revoked_by='owner',revoke_reason='Test revoked' where organization_id=$1 and user_id=$2",
            [org, participant],
          ),
        );
        assert.equal((await play("/" + id))?.status, 404);
        assert.equal((await (await play())!.json()).items.length, 0);
        summary.push({
          mode,
          format,
          steps: game.state.step,
          matches: game.state.results.filter((r) => r.away).length,
          status: game.state.status,
          leaders:
            format === "league"
              ? gameStandings(game.state, prepared.settings)
                  .filter((r) => r.rank === 1)
                  .map((r) => r.name)
              : game.state.entries
                  .filter((e) => e.id === game.state.results.at(-1)?.winner)
                  .map((e) => e.name),
        });
      }
    console.log("Complete SQL/API rehearsal:", JSON.stringify(summary));
  } finally {
    await db.close();
  }
});

test("deterministic balance smoke check: equal strength has no material home bias and stronger players improve expected wins", () => {
  const saved = snapshot("team_league", "league"),
    state = activateGame(saved);
  state.step = gameSlots(saved).findIndex((s) => s.kind === "round");
  const fixture = saved.plan.rounds[0]!.matches.find((m) => m.away)!;
  const home = "entryId" in fixture.home ? fixture.home.entryId : "";
  const strong = structuredClone(state);
  strong.entries
    .find((e) => e.id === home)!
    .players.forEach((p) => {
      p.attack += 10;
      p.defence += 10;
      p.control += 10;
    });
  let homeWins = 0,
    awayWins = 0,
    strongWins = 0;
  for (let i = 0; i < 4000; i++) {
    const baseline = advanceGame(
      saved,
      state,
      "balance-" + i,
      {},
    ).event.results.find((r) => r.id === fixture.id)!;
    const boosted = advanceGame(
      saved,
      strong,
      "balance-" + i,
      {},
    ).event.results.find((r) => r.id === fixture.id)!;
    if (baseline.winner === home) homeWins++;
    else if (baseline.winner) awayWins++;
    if (boosted.winner === home) strongWins++;
  }
  assert.ok(Math.abs(homeWins - awayWins) / 4000 < 0.07);
  assert.ok(strongWins > homeWins + 100);
  console.log(
    "Seeded balance smoke:",
    JSON.stringify({
      samples: 4000,
      equalHomeWins: homeWins,
      equalAwayWins: awayWins,
      strongHomeWins: strongWins,
    }),
  );
});
