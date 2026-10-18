import { CommunityError, nameInput, uuid } from "../community/contracts.ts";
export type AudienceGroup = { id: string; name: string; archived: boolean };
export type Activity = {
  id: string;
  name: string;
  description: string;
  location: string;
  timezone: string;
  cancelled: boolean;
  version: number;
  createdAt: string;
  audienceGroupIds: string[];
  groups: AudienceGroup[];
  nextSession: {
    id: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
  } | null;
};
export type Session = {
  id: string;
  activityId: string;
  name: string;
  description: string;
  location: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
  cancellationReason: string;
  version: number;
  createdAt: string;
  audienceGroupIds: string[];
  groups: AudienceGroup[];
};
export type ActivityFields = {
  name: string;
  description: string;
  location: string;
  audienceGroupIds: string[];
};
export type SessionFields = {
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
function boundedText(body: Record<string, unknown>, key: string, max: number) {
  const value = body[key];
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new CommunityError("invalid_input");
  return value.trim();
}
export function activityInput(body: Record<string, unknown>, timezone: string) {
  const name = nameInput(body),
    description = boundedText(body, "description", 2000),
    location = boundedText(body, "location", 160);
  const ids = body.audienceGroupIds;
  if (!Array.isArray(ids) || ids.length > 20)
    throw new CommunityError("activity_audience");
  const audienceGroupIds = ids.map((id) => uuid(id)).sort();
  if (new Set(audienceGroupIds).size !== ids.length)
    throw new CommunityError("activity_audience");
  return { name, description, location, timezone, audienceGroupIds };
}
export function sessionInput(body: Record<string, unknown>, timezone: string) {
  const location = boundedText(body, "location", 160),
    startsAt = zonedInstant(body.startLocal, timezone),
    endsAt = zonedInstant(body.endLocal, timezone);
  if (
    Date.parse(endsAt) <= Date.parse(startsAt) ||
    Date.parse(endsAt) - Date.parse(startsAt) > 7 * 86400000
  )
    throw new CommunityError("activity_time");
  if (Date.parse(startsAt) <= Date.now())
    throw new CommunityError("session_future");
  return { location, startsAt, endsAt, timezone };
}
export function cancellationReason(body: Record<string, unknown>) {
  return boundedText(body, "reason", 300);
}
export type ActivityInput = ReturnType<typeof activityInput>;
export type SessionInput = ReturnType<typeof sessionInput>;
