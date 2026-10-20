import { CommunityError, nameInput } from "../community/contracts.ts";
import { localTime, zonedInstant } from "../activities/contracts.ts";
import {
  validateSettings,
  makeFutsalPlan,
  FutsalRuleError,
  type FutsalSettings,
  type FutsalPlan,
  FUTSAL_RULES_VERSION,
} from "../domain/futsal-setup.ts";
export type FutsalSeason = {
  id: string;
  name: string;
  description: string;
  prizeCriteria: string;
  status: "draft" | "prepared" | "cancelled";
  version: number;
  gameStatus?: "active" | "completed" | null;
  settings: FutsalSettings;
  seed: string;
  createdAt: string;
  preparedAt: string | null;
  cancelReason: string | null;
  snapshot: {
    rulesVersion: string;
    settings: FutsalSettings;
    plan: FutsalPlan;
    entries: FutsalEntry[];
  } | null;
  entryCount: number;
};
export type FutsalEntry = {
  id: string;
  name: string;
  createdAt: string;
  members: { id: string; name: string; archived: boolean }[];
};
export function futsalCalendar(timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const local = (instant: string) => {
    const parts = formatter.formatToParts(new Date(instant)),
      get = (key: string) => parts.find((p) => p.type === key)!.value;
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  };
  const offsetsByDay = new Map<string, number[]>();
  const instant = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
      throw new CommunityError("activity_time");
    const base = Date.parse(value + ":00Z");
    if (!Number.isFinite(base)) throw new CommunityError("activity_time");
    const day = value.slice(0, 10);
    let offsets = offsetsByDay.get(day);
    if (!offsets) {
      const noon = Date.parse(day + "T12:00:00Z"),
        found = new Set<number>();
      for (let h = -36; h <= 36; h += 6) {
        const at = noon + h * 3600000;
        found.add(Date.parse(local(new Date(at).toISOString()) + ":00Z") - at);
      }
      offsets = [...found];
      offsetsByDay.set(day, offsets);
    }
    const matches = offsets
      .map((offset) => base - offset)
      .filter((at) => local(new Date(at).toISOString()) === value);
    if (matches.length !== 1) throw new CommunityError("activity_time");
    return new Date(matches[0]!).toISOString();
  };
  return { local, instant };
}
export function seasonPlan(
  settings: FutsalSettings,
  ids: string[],
  seed: string,
) {
  try {
    return makeFutsalPlan(
      settings,
      ids,
      seed,
      futsalCalendar(settings.timezone),
    );
  } catch (e) {
    if (e instanceof FutsalRuleError) throw new CommunityError(e.code);
    throw e;
  }
}
export function seasonInput(body: Record<string, unknown>, timezone: string) {
  const text = (key: string, max: number) => {
    if (
      typeof body[key] !== "string" ||
      String(body[key]).length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(String(body[key]))
    )
      throw new CommunityError("invalid_input");
    return String(body[key]).trim();
  };
  try {
    const raw = body.settings as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new CommunityError("futsal_settings");
    const settings = validateSettings({
      ...raw,
      ...(raw.mode === "club_manager"
        ? { playersPerTeam: 1 }
        : { squadSize: 5 }),
      ...(raw.format === "tournament"
        ? { legs: 1, winPoints: 3, drawPoints: 1, lossPoints: 0 }
        : { drawPolicy: "entry_order" }),
      timezone,
      preparationStartsAt: zonedInstant(raw.preparationLocal, timezone),
      startsAt: zonedInstant(raw.startLocal, timezone),
      endsAt: zonedInstant(raw.endLocal, timezone),
    });
    // Validate the complete calendar even before entrants have been assigned.
    seasonPlan(
      settings,
      Array.from({ length: settings.entryCount }, (_, i) => "slot-" + i),
      "draft",
    );
    return {
      name: nameInput(body),
      description: text("description", 1000),
      prizeCriteria: text("prizeCriteria", 500),
      settings,
      rulesVersion: FUTSAL_RULES_VERSION,
    };
  } catch (e) {
    if (e instanceof FutsalRuleError) throw new CommunityError(e.code);
    throw e;
  }
}
export function defaultSettings(timezone: string): FutsalSettings {
  const at = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * 86400000);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  return {
    schemaVersion: 1,
    mode: "team_league",
    format: "league",
    entryCount: 4,
    playersPerTeam: 3,
    squadSize: 5,
    timezone,
    preparationStartsAt: at(1, 16),
    startsAt: at(15, 18),
    endsAt: at(50, 20),
    startingRating: 50,
    ratingCeiling: 90,
    trainingEveryDays: 7,
    roundEveryDays: 7,
    trainingBetweenRounds: true,
    baseGrowth: 1,
    bonusGrowth: 1,
    maxGrowth: 2,
    pointsPerStep: 10,
    chanceStep: 5,
    chanceCap: 30,
    legs: 1,
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    drawPolicy: "seeded_draw",
  };
}
