import { CommunityError, nameInput } from "../community/contracts.ts";
export type Activity = {
  id: string;
  name: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  cancelled: boolean;
  version: number;
  createdAt: string;
};
export type ActivityFields = {
  name: string;
  description: string;
  location: string;
  startLocal: string;
  endLocal: string;
};
export function localTime(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
// Reject nonexistent and ambiguous DST times instead of silently shifting an event.
export function zonedInstant(value: unknown, timezone: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    throw new CommunityError("activity_time");
  const base = Date.parse(value + "Z");
  if (!Number.isFinite(base)) throw new CommunityError("activity_time");
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const at = base + h * 3600000;
    offsets.add(
      Date.parse(localTime(new Date(at).toISOString(), timezone) + "Z") - at,
    );
  }
  const matches = [...offsets]
    .map((offset) => base - offset)
    .filter((at) => localTime(new Date(at).toISOString(), timezone) === value);
  if (matches.length !== 1) throw new CommunityError("activity_time");
  return new Date(matches[0]!).toISOString();
}
export function activityInput(body: Record<string, unknown>, timezone: string) {
  const name = nameInput(body);
  const text = (key: string, max: number) => {
    const value = body[key];
    if (
      typeof value !== "string" ||
      value.trim().length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
    )
      throw new CommunityError("invalid_input");
    return value.trim();
  };
  const description = text("description", 2000),
    location = text("location", 160);
  const startsAt = zonedInstant(body.startLocal, timezone),
    endsAt = zonedInstant(body.endLocal, timezone);
  if (
    Date.parse(endsAt) <= Date.parse(startsAt) ||
    Date.parse(endsAt) - Date.parse(startsAt) > 7 * 86400000
  )
    throw new CommunityError("activity_time");
  return { name, description, location, startsAt, endsAt, timezone };
}
export type ActivityInput = ReturnType<typeof activityInput>;
