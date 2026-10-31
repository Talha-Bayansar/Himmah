import { createContext, useContext, useState, lazy, Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { FormSurface } from "../components/shared/form-surface";
import { Button } from "../components/ui/button";
const ComparisonChart = lazy(() => import("./ComparisonChart"));
export const StatisticPeriods = createContext<{
  current: string;
  previous: string;
} | null>(null);
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import { metricChange } from "./statistics";
export function Statistic({
  label,
  value,
  current,
  previous,
  icon: Icon,
  preference = "higher",
  points = false,
  previousValue,
}: {
  label: string;
  value: string;
  current: number | null;
  previous?: number | null | undefined;
  icon: LucideIcon;
  preference?: "higher" | "lower" | "neutral";
  points?: boolean;
  previousValue?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const periods = useContext(StatisticPeriods);
  const locale = useLocale()?.locale ?? "en";
  const change = metricChange(current, previous, preference, points);
  const number = (n: number) =>
    Math.abs(n).toLocaleString(locale, { maximumFractionDigits: 1 });
  const text = !change
    ? m.statistics_unavailable()
    : change.direction === "same"
      ? m.statistics_same()
      : change.change === null
        ? m.statistics_from_zero()
        : points
          ? change.direction === "up"
            ? m.statistics_points_up({ value: number(change.change) })
            : m.statistics_points_down({ value: number(change.change) })
          : change.change === 0
            ? change.direction === "up"
              ? m.statistics_small_up()
              : m.statistics_small_down()
            : change.direction === "up"
              ? m.statistics_up({ value: number(change.change) })
              : m.statistics_down({ value: number(change.change) });
  const Direction =
    change?.direction === "up"
      ? ArrowUpRight
      : change?.direction === "down"
        ? ArrowDownRight
        : Minus;
  const reference = change
    ? m.statistics_previous({
        value:
          previousValue ??
          (points
            ? m.statistics_percentage({ value: number(change.previous) })
            : number(change.previous)),
      })
    : "";
  const prior =
    previousValue ??
    (points
      ? m.statistics_percentage({ value: number(previous ?? 0) })
      : number(previous ?? 0));
  return (
    <div className="statistic">
      <dt>
        <Icon aria-hidden="true" size={16} />
        <span>{label}</span>
      </dt>
      <dd>
        <button
          type="button"
          className="statistic-trigger"
          aria-label={m.chart_open({ label })}
          aria-description={`${value}. ${text}. ${reference}`}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <span className="statistic-number">{value}</span>
          <span
            className="statistic-change"
            data-tone={change?.tone ?? "neutral"}
          >
            <Direction aria-hidden="true" size={16} />
            <span>{text}</span>
            {reference && <span className="sr-only">{reference}</span>}
          </span>
          <ChevronRight
            size={16}
            className="statistic-chevron"
            aria-hidden="true"
          />
        </button>
      </dd>
      {open && (
        <FormSurface
          title={label}
          description={m.chart_comparison()}
          onClose={() => setOpen(false)}
        >
          <dl className="comparison-values">
            <div>
              <dt>{m.chart_current()}</dt>
              <dd>{value}</dd>
              {periods && <p>{periods.current}</p>}
            </div>
            <div>
              <dt>{m.chart_previous()}</dt>
              <dd>{previous == null ? m.statistics_unavailable() : prior}</dd>
              {periods && <p>{periods.previous}</p>}
            </div>
          </dl>
          <p className="statistic-change" data-tone={change?.tone ?? "neutral"}>
            <Direction size={16} aria-hidden="true" />
            {text}
          </p>
          {current != null && previous != null && (
            <Suspense fallback={<p>{m.directory_loading()}</p>}>
              <ComparisonChart
                current={current}
                previous={previous}
                currentValue={value}
                previousValue={prior}
              />
            </Suspense>
          )}
          <p className="activity-note">{m.chart_comparison_help()}</p>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {m.chart_close()}
          </Button>
        </FormSurface>
      )}
    </div>
  );
}
