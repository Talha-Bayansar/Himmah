import { CommunityError } from "../community/contracts.ts";
import {
  localTime,
  sessionInput,
  zonedInstant,
  type Session,
} from "./contracts.ts";
export type Occurrence = { startLocal: string; endLocal: string };
export type ScheduleRow = Pick<
  Session,
  "id" | "version" | "startsAt" | "endsAt" | "timezone" | "topic" | "name"
>;
const day = 86400000;
export function shiftLocal(value: string, milliseconds: number) {
  const at = Date.parse(value + "Z");
  if (!Number.isFinite(at)) throw new CommunityError("activity_time");
  return new Date(at + milliseconds).toISOString().slice(0, 16);
}
/** Bounded weekly expansion in the organization's wall clock, never the device timezone. */
export function weeklyOccurrences(
  start: string,
  end: string,
  weekdays: number[],
  stop: { count?: number; until?: string },
): Occurrence[] {
  const at = Date.parse(start + "Z"),
    finish = Date.parse(end + "Z"),
    duration = finish - at;
  if (
    !Number.isFinite(at) ||
    !Number.isFinite(finish) ||
    new Date(at).toISOString().slice(0, 16) !== start ||
    new Date(finish).toISOString().slice(0, 16) !== end ||
    duration <= 0 ||
    duration > 7 * day
  )
    throw new CommunityError("activity_time");
  if (
    !weekdays.length ||
    new Set(weekdays).size !== weekdays.length ||
    weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new CommunityError("series_limit");
  if ((stop.count === undefined) === (stop.until === undefined))
    throw new CommunityError("invalid_input");
  if (
    stop.count !== undefined &&
    (!Number.isInteger(stop.count) || stop.count < 2 || stop.count > 52)
  )
    throw new CommunityError("series_limit");
  const until =
    stop.until === undefined ? null : Date.parse(stop.until + "T23:59:00Z");
  if (
    until !== null &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(stop.until!) ||
      !Number.isFinite(until) ||
      new Date(until).toISOString().slice(0, 10) !== stop.until ||
      until < at ||
      until > at + 366 * day)
  )
    throw new CommunityError("series_limit");
  const result: Occurrence[] = [];
  for (let i = 0; i <= 366; i++) {
    const date = new Date(at + i * day);
    if (until !== null && date.getTime() > until) break;
    if (!weekdays.includes(date.getUTCDay())) continue;
    const startLocal = date.toISOString().slice(0, 16);
    result.push({ startLocal, endLocal: shiftLocal(startLocal, duration) });
    if (result.length > 52) throw new CommunityError("series_limit");
    if (stop.count !== undefined && result.length === stop.count) break;
  }
  if (
    result.length < 2 ||
    (stop.count !== undefined && result.length !== stop.count)
  )
    throw new CommunityError("series_limit");
  return result;
}
export function rescheduleOccurrences(
  rows: ScheduleRow[],
  anchor: ScheduleRow,
  start: string,
  end: string,
) {
  const delta =
    Date.parse(start + "Z") -
    Date.parse(localTime(anchor.startsAt, anchor.timezone) + "Z");
  const duration = Date.parse(end + "Z") - Date.parse(start + "Z");
  if (
    !Number.isFinite(delta) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 7 * day
  )
    throw new CommunityError("activity_time");
  return rows.map((row) => {
    const startLocal = shiftLocal(localTime(row.startsAt, row.timezone), delta);
    return {
      id: row.id,
      version: row.version,
      startLocal,
      endLocal: shiftLocal(startLocal, duration),
    };
  });
}
/** Shared client/server validation. DST gaps/duplicates invalidate the whole preview. */
export function validateOccurrences(
  occurrences: Occurrence[],
  timezone: string,
) {
  return occurrences.map((value) =>
    sessionInput({ ...value, location: "" }, timezone),
  );
}
export function scheduleTimes(value: Occurrence, timezone: string) {
  return {
    startsAt: zonedInstant(value.startLocal, timezone),
    endsAt: zonedInstant(value.endLocal, timezone),
  };
}
