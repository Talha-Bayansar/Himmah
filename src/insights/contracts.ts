import { CommunityError, uuid } from "../community/contracts.ts";
export type InsightsFilters = {
  from: string;
  to: string;
  activity: string;
  group: string;
  bucket: "week" | "month";
};
export type InsightsOption = {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
};
export type InsightsActivity = {
  id: string;
  name: string;
  createdAt: string;
  sessions: number;
  visits: number;
  unique: number;
  chargedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
};
export type InsightsReport = {
  filters: InsightsFilters;
  activityName?: string | null;
  groupName?: string | null;
  timezone: string;
  generatedAt: string;
  summary: {
    sessions: number;
    visits: number;
    unique: number;
    first: number;
    returning: number;
    registrations: number;
    registeredPresent: number;
    walkIns: number;
    previous?: {
      sessions: number;
      visits: number;
      unique: number;
      first: number;
      returning: number;
      chargedMinor: number;
      paidMinor: number;
      outstandingMinor: number;
    };
    comparisonKind?: "month" | "period";
    previousVisits: number;
    previousFrom: string;
    previousTo: string;
    chargedMinor: number;
    paidMinor: number;
    outstandingMinor: number;
    cashMinor: number;
    unallocatedMinor: number | null;
  };
  trend: { date: string; visits: number; unique: number }[];
  items: InsightsActivity[];
  nextCursor: string | null;
};
export function localDate(now: Date, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => p.find((v) => v.type === k)!.value)
    .join("-");
}
export function insightsFilters(
  values: Record<string, unknown>,
  timezone: string,
  now = new Date(),
): InsightsFilters {
  const today = localDate(now, timezone),
    from = values.from || today.slice(0, 7) + "-01",
    to = values.to || today;
  const date = (v: unknown) =>
    typeof v === "string" &&
    /^20\d{2}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
    new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
  if (!date(from) || !date(to)) throw new CommunityError("insights_range");
  const days =
    (Date.parse(String(to)) - Date.parse(String(from))) / 86400000 + 1;
  if (days < 1 || days > 366) throw new CommunityError("insights_range");
  const bucket = values.bucket || "week";
  if (bucket !== "week" && bucket !== "month")
    throw new CommunityError("invalid_input");
  return {
    from: String(from),
    to: String(to),
    activity: values.activity ? uuid(values.activity) : "",
    group: values.group ? uuid(values.group) : "",
    bucket,
  };
}
