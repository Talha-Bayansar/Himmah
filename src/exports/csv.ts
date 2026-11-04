import Papa from "papaparse";
import { m } from "../paraglide/messages.js";
import { CommunityError } from "../community/contracts.ts";
import {
  EXPORT_BYTES,
  EXPORT_ROWS,
  type ExportFilters,
  type ExportSnapshot,
} from "./contracts.ts";
type Cell = { text: string } | { number: string };
type Row = Record<string, unknown>;
const text = (v: unknown): Cell => ({ text: v == null ? "" : String(v) });
const integer = (v: unknown): Cell => {
  if (typeof v === "number" && !Number.isSafeInteger(v))
    throw new CommunityError("export_number", 503);
  const value = String(v);
  if (!/^-?\d+$/.test(value)) throw new CommunityError("export_number", 503);
  return { number: value };
};
function money(v: unknown): Cell {
  if (v == null) return text("");
  const value = integer(v);
  if (!("number" in value)) throw Error();
  const n = BigInt(value.number),
    abs = n < 0n ? -n : n;
  return {
    number:
      (n < 0n ? "-" : "") +
      String(abs / 100n) +
      "." +
      String(abs % 100n).padStart(2, "0"),
  };
}
// Quoting alone does not prevent spreadsheet formula execution. Protect text, preserve typed numbers.
export function spreadsheetText(value: string) {
  return /^(?:[\s\u0000-\u0020\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]*[=+\-@＝＋－＠]|[\u0000-\u001f\u007f-\u009f])/u.test(
    value,
  )
    ? "'" + value
    : value;
}
export function exportCsv(snapshot: ExportSnapshot, f: ExportFilters) {
  if (snapshot.tooLarge) throw new CommunityError("export_limit", 413);
  const message = (key: string) =>
    (
      m as unknown as Record<
        string,
        (a: Record<string, never>, options: { locale: string }) => string
      >
    )["export_" + key]!({}, { locale: f.locale });
  const bool = (value: unknown) =>
    text(value == null ? "" : message(value ? "yes" : "no"));
  type Column = { key: string; value: (r: Row) => Cell };
  const col = (
    key: string,
    field = key,
    kind: "text" | "number" | "money" | "bool" = "text",
  ): Column => ({
    key,
    value: (r) =>
      kind === "number"
        ? integer(r[field])
        : kind === "money"
          ? money(r[field])
          : kind === "bool"
            ? bool(r[field])
            : text(r[field]),
  });
  const status: Column = {
    key: "payment_status",
    value: (r) =>
      text(
        message(
          r.chargedMinor == null
            ? "no_charge"
            : BigInt(String(r.outstandingMinor)) === 0n
              ? "paid"
              : BigInt(String(r.paidMinor)) > 0n
                ? "partial"
                : "unpaid",
        ),
      ),
  };
  const session = [
    col("activity", "activity"),
    col("session_name", "sessionName"),
    col("topic"),
    col("session_id", "sessionId"),
    col("starts_at", "startsAt"),
    col("local_start", "localStart"),
    col("session_timezone", "sessionTimezone"),
    col("cancelled", "cancelled", "bool"),
  ];
  let rows = snapshot.items,
    columns: Column[];
  if (f.kind === "contacts")
    columns = [
      col("contact_id", "id"),
      col("name"),
      col("given_name", "givenName"),
      col("family_name", "familyName"),
      col("primary_email", "email"),
      col("primary_phone", "phone"),
      col("archived", "archived", "bool"),
      col("group_count", "groupCount", "number"),
      col("created_at", "createdAt"),
    ];
  else if (f.kind === "attendance" || f.kind === "balances")
    columns = [
      col("contact_id", "contactId"),
      col("name"),
      col("archived", "archived", "bool"),
      ...session,
      ...(f.kind === "balances"
        ? [col("present", "present", "bool"), col("charge_id", "id")]
        : [col("recorded_at", "recordedAt")]),
      col("charged", "chargedMinor", "money"),
      col("paid_amount", "paidMinor", "money"),
      col("outstanding", "outstandingMinor", "money"),
      status,
    ];
  else if (f.kind === "cash")
    columns = [
      col("receipt_id", "id"),
      ...session,
      col("occurred_at", "occurredAt"),
      col("collector"),
      col("cash_amount", "cashMinor", "money"),
      col("unallocated", "unallocatedMinor", "money"),
    ];
  else if (f.kind === "insights-trend") {
    rows = snapshot.trend ?? [];
    columns = [
      col("period_start", "date"),
      col("visits", "visits", "number"),
      col("unique", "unique", "number"),
    ];
  } else if (f.kind === "insights-activities")
    columns = [
      col("activity_id", "id"),
      col("activity", "name"),
      col("sessions", "sessions", "number"),
      col("visits", "visits", "number"),
      col("unique", "unique", "number"),
      col("charged", "chargedMinor", "money"),
      col("paid_amount", "paidMinor", "money"),
      col("outstanding", "outstandingMinor", "money"),
    ];
  else {
    const metrics = [
      ["sessions", "sessions"],
      ["visits", "visits"],
      ["unique", "unique"],
      ["first", "first"],
      ["returning", "returning"],
      ["registrations", "registrations"],
      ["registered_present", "registeredPresent"],
      ["walk_ins", "walkIns"],
      ["charged", "chargedMinor"],
      ["paid_amount", "paidMinor"],
      ["outstanding", "outstandingMinor"],
      ["cash_amount", "cashMinor"],
      ["unallocated", "unallocatedMinor"],
    ] as const;
    const summary = snapshot.summary;
    if (!summary) throw new CommunityError("service", 503);
    rows = metrics.map(([label, field]) => ({
      metric: message("col_" + label),
      value: summary[field],
      unit: field.endsWith("Minor") ? "EUR" : message("count_unit"),
    }));
    columns = [
      col("metric"),
      {
        key: "value",
        value: (r) =>
          r.value == null
            ? text("")
            : r.unit === "EUR"
              ? money(r.value)
              : integer(r.value),
      },
      col("unit"),
    ];
  }
  if (rows.length > EXPORT_ROWS) throw new CommunityError("export_limit", 413);
  const context: Column[] = [
    { key: "organization", value: () => text(snapshot.organizationName) },
    { key: "generated_at", value: () => text(snapshot.generatedAt) },
    { key: "report_timezone", value: () => text(snapshot.timezone) },
    {
      key: "from",
      value: () => text(f.kind === "contacts" || f.session ? "" : f.from),
    },
    {
      key: "to",
      value: () => text(f.kind === "contacts" || f.session ? "" : f.to),
    },
    { key: "activity_filter", value: () => text(snapshot.activityName) },
    { key: "group_filter", value: () => text(snapshot.groupName) },
    {
      key: "scope",
      value: () =>
        text(
          message(
            f.session
              ? "whole_session"
              : f.kind === "contacts"
                ? "contact_directory"
                : "date_range",
          ),
        ),
    },
  ];
  context.push(
    {
      key: "contact_state",
      value: () =>
        text(
          f.kind === "contacts"
            ? message(
                f.state === "active"
                  ? "active"
                  : f.state === "archived"
                    ? "archived_contacts"
                    : "all_contacts",
              )
            : "",
        ),
    },
    { key: "name_filter", value: () => text(f.kind === "contacts" ? f.q : "") },
    {
      key: "period_unit",
      value: () =>
        text(
          f.kind === "insights-trend"
            ? message(f.bucket === "week" ? "week_unit" : "month_unit")
            : "",
        ),
    },
  );
  const all = [...columns, ...context];
  const csv =
    "\ufeff" +
    Papa.unparse(
      {
        fields: all.map((c) => message("col_" + c.key)),
        data: rows.map((r) =>
          all.map((c) => {
            const value = c.value(r);
            return "text" in value ? spreadsheetText(value.text) : value.number;
          }),
        ),
      },
      { quotes: true, newline: "\r\n", escapeFormulae: false },
    );
  if (new TextEncoder().encode(csv).length > EXPORT_BYTES)
    throw new CommunityError("export_limit", 413);
  return { csv, rowCount: rows.length };
}
