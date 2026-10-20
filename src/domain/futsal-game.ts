import {
  trainingBenefit,
  type FutsalSettings,
  type FutsalPlan,
  type Opponent,
} from "./futsal-setup.ts";
export const GAME_VERSION = "futsal-game-v1";
export type GamePlayer = {
  id: string;
  personId: string | null;
  name: string;
  attack: number;
  defence: number;
  control: number;
};
export type GameEntry = { id: string; name: string; players: GamePlayer[] };
export type GameResult = {
  id: string;
  round: number;
  home: string;
  away: string | null;
  homeGoals: number;
  awayGoals: number;
  winner: string | null;
  penalties: boolean;
  inputs: {
    home: { attack: number; defence: number };
    away: { attack: number; defence: number };
  } | null;
};
export type GameState = {
  engineVersion: typeof GAME_VERSION;
  status: "active" | "completed";
  step: number;
  entries: GameEntry[];
  results: GameResult[];
};
export type GameSnapshot = {
  settings: FutsalSettings;
  plan: FutsalPlan;
  entries: {
    id: string;
    name: string;
    members: { id: string; name: string }[];
  }[];
};
export type GamePoints = Record<string, { points: number; eligible: boolean }>;
export type GameSlot = {
  kind: "training" | "round";
  index: number;
  at: string;
};
export function randomFor(seed: string) {
  let value = 2166136261;
  for (const c of seed)
    value = Math.imul(value ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let x = Math.imul(value ^ (value >>> 15), 1 | value);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function gameSlots(snapshot: GameSnapshot): GameSlot[] {
  return [
    ...snapshot.plan.trainingAt.map((at, index) => ({
      kind: "training" as const,
      index,
      at,
    })),
    ...snapshot.plan.rounds.map((r, index) => ({
      kind: "round" as const,
      index,
      at: r.at,
    })),
  ].sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) || (a.kind === "training" ? -1 : 1),
  );
}
export function activateGame(snapshot: GameSnapshot): GameState {
  const s = snapshot.settings;
  if (
    snapshot.entries.length !== s.entryCount ||
    snapshot.entries.some((e) => e.members.length !== s.playersPerTeam)
  )
    throw Error("invalid roster");
  return {
    engineVersion: GAME_VERSION,
    status: "active",
    step: 0,
    results: [],
    entries: snapshot.entries.map((e) => ({
      id: e.id,
      name: e.name,
      players: Array.from({ length: s.squadSize }, (_, i) => ({
        id: e.id + ":" + i,
        personId: s.mode === "team_league" ? (e.members[i]?.id ?? null) : null,
        name:
          s.mode === "team_league" && e.members[i]
            ? e.members[i]!.name
            : String(i + 1),
        attack: s.startingRating,
        defence: s.startingRating,
        control: s.startingRating,
      })),
    })),
  };
}
const power = (entry: GameEntry) => {
  const p = entry.players.slice(0, 5);
  return {
    attack: p.reduce((n, x) => n + x.attack + x.control, 0) / 10,
    defence: p.reduce((n, x) => n + x.defence + x.control, 0) / 10,
  };
};
function poisson(mean: number, random: () => number) {
  let n = 0,
    p = 1;
  do {
    n++;
    p *= random();
  } while (p > Math.exp(-mean) && n < 21);
  return n - 1;
}
export function advanceGame(
  snapshot: GameSnapshot,
  initial: GameState,
  seed: string,
  points: GamePoints,
) {
  if (initial.engineVersion !== GAME_VERSION || initial.status !== "active")
    throw Error("game unavailable");
  const slots = gameSlots(snapshot),
    slot = slots[initial.step];
  if (!slot) throw Error("invalid step");
  const state: GameState = structuredClone(initial),
    s = snapshot.settings;
  const growth: {
    entryId: string;
    personId: string;
    playerId: string;
    attribute: "attack" | "defence" | "control";
    points: number;
    chance: number;
    bonus: boolean;
    before: number;
    after: number;
  }[] = [];
  const results: GameResult[] = [];
  if (slot.kind === "training") {
    for (const saved of snapshot.entries) {
      const entry = state.entries.find((e) => e.id === saved.id)!;
      saved.members.forEach((member, i) => {
        const allocation = points[member.id];
        if (!allocation?.eligible) return;
        const benefit = trainingBenefit(allocation.points, s),
          random = randomFor(
            seed + ":training:" + slot.index + ":" + member.id,
          );
        const player =
          entry.players[
            s.mode === "club_manager" ? slot.index % entry.players.length : i
          ]!;
        const attribute = (["attack", "defence", "control"] as const)[
          Math.floor(random() * 3)
        ]!;
        const bonus = random() * 100 < benefit.bonusChance,
          before = player[attribute];
        player[attribute] = Math.min(
          s.ratingCeiling,
          before +
            Math.min(s.maxGrowth, s.baseGrowth + (bonus ? s.bonusGrowth : 0)),
        );
        growth.push({
          entryId: entry.id,
          personId: member.id,
          playerId: player.id,
          attribute,
          points: allocation.points,
          chance: benefit.bonusChance,
          bonus,
          before,
          after: player[attribute],
        });
      });
    }
  } else {
    const resolve = (opponent: Opponent) =>
      "entryId" in opponent
        ? opponent.entryId
        : state.results.find((r) => r.id === opponent.winnerOf)?.winner;
    for (const match of snapshot.plan.rounds[slot.index]!.matches) {
      const home = resolve(match.home),
        away = match.away ? resolve(match.away) : null;
      if (!home || (match.away && !away)) throw Error("unresolved bracket");
      let inputs: GameResult["inputs"] = null;
      let homeGoals = 0,
        awayGoals = 0,
        penalties = false,
        winner: string | null = home;
      if (away) {
        const h = power(state.entries.find((e) => e.id === home)!),
          a = power(state.entries.find((e) => e.id === away)!),
          random = randomFor(seed + ":match:" + match.id);
        const mean = (attack: number, defence: number) =>
          Math.max(0.7, Math.min(5.5, 2.2 * Math.exp((attack - defence) / 90)));
        inputs = { home: h, away: a };
        homeGoals = poisson(mean(h.attack, a.defence), random);
        awayGoals = poisson(mean(a.attack, h.defence), random);
        winner =
          homeGoals > awayGoals ? home : awayGoals > homeGoals ? away : null;
        if (!winner && s.format === "tournament") {
          penalties = true;
          winner =
            random() <
            Math.max(0.35, Math.min(0.65, 0.5 + (h.attack - a.attack) / 200))
              ? home
              : away;
        }
      }
      const result = {
        id: match.id,
        round: slot.index + 1,
        home,
        away: away ?? null,
        homeGoals,
        awayGoals,
        winner,
        penalties,
        inputs,
      };
      results.push(result);
      state.results.push(result);
    }
  }
  state.step++;
  state.status = state.step === slots.length ? "completed" : "active";
  return {
    state,
    event: {
      engineVersion: GAME_VERSION,
      kind: slot.kind,
      index: slot.index,
      at: slot.at,
      allocations: slot.kind === "training" ? structuredClone(points) : {},
      growth,
      results,
    },
  };
}
export function gameStandings(state: GameState, s: FutsalSettings) {
  const rows = state.entries.map((e) => ({
    id: e.id,
    name: e.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    rank: 0,
  }));
  for (const r of state.results) {
    if (!r.away) continue;
    for (const [id, gf, ga] of [
      [r.home, r.homeGoals, r.awayGoals],
      [r.away, r.awayGoals, r.homeGoals],
    ] as const) {
      const row = rows.find((x) => x.id === id)!;
      row.played++;
      row.goalsFor += gf;
      row.goalsAgainst += ga;
      if (gf > ga) {
        row.won++;
        row.points += s.winPoints;
      } else if (gf === ga) {
        row.drawn++;
        row.points += s.drawPoints;
      } else {
        row.lost++;
        row.points += s.lossPoints;
      }
    }
  }
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      a.id.localeCompare(b.id),
  );
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank =
      prev &&
      r.points === prev.points &&
      r.goalsFor - r.goalsAgainst === prev.goalsFor - prev.goalsAgainst &&
      r.goalsFor === prev.goalsFor
        ? prev.rank
        : i + 1;
  });
  return rows;
}
