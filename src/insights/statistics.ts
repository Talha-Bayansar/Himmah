import type { InsightsFilters } from "./contracts.ts";

/** Monthly windows compare calendar months at the same progress; custom windows use equal days. */
export function comparisonRange(f: Pick<InsightsFilters, "from" | "to">) {
  const start = new Date(f.from + "T00:00:00Z"),
    end = new Date(f.to + "T00:00:00Z");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (start.getUTCDate() === 1 && f.from.slice(0, 7) === f.to.slice(0, 7)) {
    const from = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1),
    );
    const last = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0),
    );
    const complete =
      end.getUTCDate() ===
      new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
      ).getUTCDate();
    const to = complete
      ? last
      : new Date(
          Date.UTC(
            from.getUTCFullYear(),
            from.getUTCMonth(),
            Math.min(end.getUTCDate(), last.getUTCDate()),
          ),
        );
    return { from: iso(from), to: iso(to), kind: "month" as const };
  }
  const days = (end.getTime() - start.getTime()) / 86400000 + 1;
  return {
    from: iso(new Date(start.getTime() - days * 86400000)),
    to: iso(new Date(start.getTime() - 86400000)),
    kind: "period" as const,
  };
}
export function perSession(visits: number, sessions: number) {
  return sessions > 0 ? visits / sessions : null;
}
export function share(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : null;
}
export function metricChange(
  current: number | null | undefined,
  previous: number | null | undefined,
  preference: "higher" | "lower" | "neutral" = "higher",
  points = false,
) {
  if (
    current == null ||
    previous == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  )
    return null;
  const delta = current - previous;
  // Precision matches the displayed one-decimal statistic; tiny rounding differences are not changes.
  const change = points
    ? Math.round(delta * 10) / 10
    : previous === 0
      ? null
      : Math.round((delta / previous) * 1000) / 10;
  const direction = (points ? change === 0 : delta === 0)
    ? "same"
    : delta > 0
      ? "up"
      : "down";
  const tone =
    direction === "same" || preference === "neutral"
      ? "neutral"
      : (direction === "up") === (preference === "higher")
        ? "positive"
        : "warning";
  return { direction, tone, change, previous, current };
}
