import { CommunityError, uuid } from "../community/contracts.ts";
import {
  insightsFilters,
  type InsightsFilters,
} from "../insights/contracts.ts";
export const exportKinds = [
  "contacts",
  "attendance",
  "balances",
  "cash",
  "insights-summary",
  "insights-trend",
  "insights-activities",
] as const;
export type ExportKind = (typeof exportKinds)[number];
export type ExportFilters = InsightsFilters & {
  kind: ExportKind;
  locale: "en" | "nl" | "tr";
  state: "active" | "archived" | "all";
  q: string;
  session: string;
};
export type ExportContext = {
  organizationName: string;
  timezone: string;
  activityName: string | null;
  groupName: string | null;
  sessionName: string | null;
};
export type ExportSnapshot = ExportContext & {
  tooLarge?: boolean;
  generatedAt: string;
  items: Record<string, unknown>[];
  summary?: Record<string, unknown>;
  trend?: Record<string, unknown>[];
};
export const EXPORT_ROWS = 10000,
  EXPORT_BYTES = 8 * 1024 * 1024;
export function exportFilters(
  raw: Record<string, unknown>,
  timezone: string,
): ExportFilters {
  if (
    Object.keys(raw).some(
      (k) =>
        ![
          "kind",
          "locale",
          "from",
          "to",
          "activity",
          "group",
          "bucket",
          "state",
          "q",
          "session",
        ].includes(k),
    )
  )
    throw new CommunityError("invalid_input");
  const kind = raw.kind || "contacts",
    locale = raw.locale || "en",
    state = raw.state || "active",
    q = raw.q ?? "",
    session = raw.session ? uuid(raw.session) : "";
  if (
    !exportKinds.includes(kind as ExportKind) ||
    !["en", "nl", "tr"].includes(String(locale)) ||
    !["active", "archived", "all"].includes(String(state)) ||
    typeof q !== "string" ||
    q.length > 80 ||
    /[\u0000-\u001f\u007f]/u.test(q)
  )
    throw new CommunityError("invalid_input");
  if (
    (Object.hasOwn(raw, "from") && raw.from === "") ||
    (Object.hasOwn(raw, "to") && raw.to === "")
  )
    throw new CommunityError("insights_range");
  const filters = insightsFilters(raw, timezone);
  if (
    (kind === "contacts" && (filters.activity || session)) ||
    (kind !== "contacts" && (q || state !== "active")) ||
    (session && (!filters.activity || String(kind).startsWith("insights")))
  )
    throw new CommunityError("invalid_input");
  return {
    ...filters,
    kind: kind as ExportKind,
    locale: locale as ExportFilters["locale"],
    state: state as ExportFilters["state"],
    q: q.trim(),
    session,
  };
}
export function exportSearch(raw: Record<string, unknown>) {
  const fields = [
    "kind",
    "locale",
    "from",
    "to",
    "activity",
    "group",
    "bucket",
    "state",
    "q",
    "session",
    "origin",
  ];
  return Object.fromEntries(
    fields
      .filter((k) => typeof raw[k] === "string")
      .map((k) => [k, String(raw[k]).slice(0, k === "q" ? 80 : 100)]),
  ) as Partial<Record<keyof ExportFilters, string>> & { origin?: string };
}
export function exportParams(f: ExportFilters) {
  return new URLSearchParams(
    Object.entries(f).filter(([, v]) => v !== ""),
  ).toString();
}
