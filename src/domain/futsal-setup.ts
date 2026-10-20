/** Setup rules only. This module does not simulate matches or claim balanced gameplay. */
export const FUTSAL_RULES_VERSION = "futsal-setup-v1";
export type FutsalMode = "club_manager" | "team_league";
export type FutsalFormat = "league" | "tournament";
export interface FutsalSettings {
  schemaVersion: 1;
  mode: FutsalMode;
  format: FutsalFormat;
  entryCount: number;
  playersPerTeam: number;
  squadSize: number;
  timezone: string;
  preparationStartsAt: string;
  startsAt: string;
  endsAt: string;
  startingRating: number;
  ratingCeiling: number;
  trainingEveryDays: number;
  roundEveryDays: number;
  trainingBetweenRounds: boolean;
  baseGrowth: number;
  bonusGrowth: number;
  maxGrowth: number;
  pointsPerStep: number;
  chanceStep: number;
  chanceCap: number;
  legs: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  drawPolicy: "entry_order" | "seeded_draw";
}
export class FutsalRuleError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export function validateSettings(value: unknown): FutsalSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new FutsalRuleError("futsal_settings");
  const v = value as Record<string, unknown>;
  const integer = (key: string, min: number, max: number) => {
    const n = v[key];
    if (!Number.isSafeInteger(n) || Number(n) < min || Number(n) > max)
      throw new FutsalRuleError("futsal_settings");
    return Number(n);
  };
  if (
    v.schemaVersion !== 1 ||
    !["club_manager", "team_league"].includes(String(v.mode)) ||
    !["league", "tournament"].includes(String(v.format)) ||
    !["entry_order", "seeded_draw"].includes(String(v.drawPolicy)) ||
    typeof v.trainingBetweenRounds !== "boolean"
  )
    throw new FutsalRuleError("futsal_settings");
  if (typeof v.timezone !== "string") throw new FutsalRuleError("futsal_dates");
  try {
    new Intl.DateTimeFormat("en", { timeZone: v.timezone });
  } catch {
    throw new FutsalRuleError("futsal_dates");
  }
  const instant = (key: string) => {
    const s = v[key];
    if (
      typeof s !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s) ||
      !Number.isFinite(Date.parse(s))
    )
      throw new FutsalRuleError("futsal_dates");
    return new Date(s).toISOString();
  };
  const mode = v.mode as FutsalMode,
    format = v.format as FutsalFormat;
  const settings: FutsalSettings = {
    schemaVersion: 1,
    mode,
    format,
    timezone: v.timezone,
    preparationStartsAt: instant("preparationStartsAt"),
    startsAt: instant("startsAt"),
    endsAt: instant("endsAt"),
    entryCount: integer("entryCount", 2, 16),
    playersPerTeam: integer("playersPerTeam", 1, 5),
    squadSize: integer("squadSize", 5, 7),
    startingRating: integer("startingRating", 30, 70),
    ratingCeiling: integer("ratingCeiling", 31, 99),
    trainingEveryDays: integer("trainingEveryDays", 1, 14),
    roundEveryDays: integer("roundEveryDays", 1, 14),
    trainingBetweenRounds: v.trainingBetweenRounds,
    baseGrowth: integer("baseGrowth", 1, 2),
    bonusGrowth: integer("bonusGrowth", 1, 2),
    maxGrowth: integer("maxGrowth", 2, 3),
    pointsPerStep: integer("pointsPerStep", 1, 1000),
    chanceStep: integer("chanceStep", 1, 10),
    chanceCap: integer("chanceCap", 5, 40),
    legs: integer("legs", 1, 2),
    winPoints: integer("winPoints", 1, 5),
    drawPoints: integer("drawPoints", 0, 3),
    lossPoints: integer("lossPoints", 0, 1),
    drawPolicy: v.drawPolicy as FutsalSettings["drawPolicy"],
  };
  if (
    mode === "club_manager"
      ? settings.playersPerTeam !== 1 || ![5, 7].includes(settings.squadSize)
      : settings.playersPerTeam < 2 || settings.squadSize !== 5
  )
    throw new FutsalRuleError("futsal_roster");
  if (
    settings.startingRating >= settings.ratingCeiling ||
    settings.baseGrowth + settings.bonusGrowth > settings.maxGrowth ||
    settings.chanceStep > settings.chanceCap
  )
    throw new FutsalRuleError("futsal_growth");
  if (
    settings.winPoints <= settings.drawPoints ||
    settings.drawPoints < settings.lossPoints
  )
    throw new FutsalRuleError("futsal_standings");
  const prep = Date.parse(settings.preparationStartsAt),
    start = Date.parse(settings.startsAt),
    end = Date.parse(settings.endsAt);
  if (prep >= start || start >= end || end - prep > 180 * 86400000)
    throw new FutsalRuleError("futsal_dates");
  return settings;
}
/** Inject the organization calendar conversion; ambiguous/missing DST slots must throw. */
export interface Calendar {
  local(instant: string): string;
  instant(local: string): string;
}
const shift = (value: string, days: number, minutes = 0) =>
  new Date(Date.parse(value + ":00Z") + days * 86400000 + minutes * 60000)
    .toISOString()
    .slice(0, 16);
export type Opponent = { entryId: string } | { winnerOf: string };
export type PlannedMatch = {
  id: string;
  home: Opponent;
  away: Opponent | null;
};
export type PlannedRound = {
  number: number;
  at: string;
  matches: PlannedMatch[];
};
export type FutsalPlan = {
  rulesVersion: string;
  rounds: PlannedRound[];
  trainingAt: string[];
  matchCount: number;
  byeCount: number;
};
function seededOrder<T>(items: T[], seed: string): T[] {
  let state = 2166136261;
  for (const c of seed)
    state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
export function makeFutsalPlan(
  input: FutsalSettings,
  entryIds: string[],
  seed: string,
  calendar: Calendar,
): FutsalPlan {
  const s = validateSettings(input);
  if (
    entryIds.length !== s.entryCount ||
    new Set(entryIds).size !== entryIds.length
  )
    throw new FutsalRuleError("futsal_entries");
  const rounds: PlannedRound[] = [];
  const first = calendar.local(s.startsAt);
  const addRound = (matches: PlannedMatch[]) => {
    const number = rounds.length + 1;
    rounds.push({
      number,
      at: calendar.instant(shift(first, (number - 1) * s.roundEveryDays)),
      matches,
    });
  };
  if (s.format === "league") {
    const ring: (string | null)[] = [...entryIds];
    if (ring.length % 2) ring.push(null);
    const firstLeg: PlannedMatch[][] = [];
    for (let r = 0; r < ring.length - 1; r++) {
      const matches: PlannedMatch[] = [];
      for (let i = 0; i < ring.length / 2; i++) {
        const a = ring[i],
          b = ring[ring.length - 1 - i];
        const [home, away] = i === 0 && r % 2 === 1 ? [b, a] : [a, b];
        matches.push({
          id: `r${r + 1}m${i + 1}`,
          home: { entryId: (home ?? away)! },
          away: home && away ? { entryId: away } : null,
        });
      }
      firstLeg.push(matches);
      addRound(matches);
      ring.splice(1, 0, ring.pop()!);
    }
    if (s.legs === 2)
      for (const matches of firstLeg) {
        const round = rounds.length + 1;
        addRound(
          matches.map((m, i) => ({
            id: `r${round}m${i + 1}`,
            home: m.away ?? m.home,
            away: m.away ? m.home : null,
          })),
        );
      }
  } else {
    const entries =
      s.drawPolicy === "seeded_draw" ? seededOrder(entryIds, seed) : entryIds;
    let size = 2;
    while (size < entries.length) size *= 2;
    let positions = [1, 2];
    while (positions.length < size) {
      const n = positions.length * 2 + 1;
      positions = positions.flatMap((p) => [p, n - p]);
    }
    let slots: (Opponent | null)[] = positions.map((p) =>
      entries[p - 1] ? { entryId: entries[p - 1]! } : null,
    );
    while (slots.length > 1) {
      const matches: PlannedMatch[] = [],
        next: Opponent[] = [];
      const round = rounds.length + 1;
      for (let i = 0; i < slots.length; i += 2) {
        const a = slots[i],
          b = slots[i + 1],
          id = `r${round}m${i / 2 + 1}`;
        if (!a && !b) throw new FutsalRuleError("futsal_entries");
        matches.push({ id, home: (a ?? b)!, away: a && b ? b : null });
        next.push(a && b ? { winnerOf: id } : (a ?? b)!);
      }
      addRound(matches);
      slots = next;
    }
  }
  const last = rounds.at(-1)!.at;
  if (Date.parse(last) >= Date.parse(s.endsAt))
    throw new FutsalRuleError("futsal_calendar");
  const trainingAt: string[] = [],
    cutoff = shift(first, 0, -60),
    prep = Date.parse(s.preparationStartsAt);
  for (let i = 0; i < 129; i++) {
    const at = calendar.instant(shift(cutoff, -i * s.trainingEveryDays));
    if (Date.parse(at) < prep) break;
    trainingAt.unshift(at);
  }
  if (!trainingAt.length) throw new FutsalRuleError("futsal_preparation");
  if (s.trainingBetweenRounds)
    for (let i = 1; i < 129; i++) {
      const at = calendar.instant(shift(cutoff, i * s.trainingEveryDays));
      if (Date.parse(at) >= Date.parse(last)) break;
      trainingAt.push(at);
    }
  if (trainingAt.length > 128) throw new FutsalRuleError("futsal_calendar");
  return {
    rulesVersion: FUTSAL_RULES_VERSION,
    rounds,
    trainingAt,
    matchCount: rounds.reduce(
      (n, r) => n + r.matches.filter((m) => m.away).length,
      0,
    ),
    byeCount: rounds.reduce(
      (n, r) => n + r.matches.filter((m) => !m.away).length,
      0,
    ),
  };
}
export function trainingBenefit(points: number, s: FutsalSettings) {
  if (!Number.isFinite(points)) throw new FutsalRuleError("futsal_settings");
  return {
    guaranteedGrowth: s.baseGrowth,
    bonusChance: Math.min(
      s.chanceCap,
      Math.floor(Math.max(0, points) / s.pointsPerStep) * s.chanceStep,
    ),
    maximumGrowth: Math.min(s.maxGrowth, s.baseGrowth + s.bonusGrowth),
  };
}
