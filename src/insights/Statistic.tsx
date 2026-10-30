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
  return (
    <div className="statistic">
      <dt>
        <Icon aria-hidden="true" size={16} />
        <span>{label}</span>
      </dt>
      <dd>
        <span className="statistic-number">{value}</span>
        <span
          className="statistic-change"
          data-tone={change?.tone ?? "neutral"}
          title={reference}
        >
          <Direction aria-hidden="true" size={16} />
          <span>{text}</span>
          {reference && <span className="sr-only">{reference}</span>}
        </span>
      </dd>
    </div>
  );
}
