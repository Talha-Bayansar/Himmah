import type { ReactNode, CSSProperties } from "react";
/** Read-only summaries deliberately have no button affordance; drill-downs use Statistic. */
export function MetricSummary({
  items,
  label,
  className = "",
  compact = false,
}: {
  items: { label: string; value: ReactNode; icon?: ReactNode }[];
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <dl
      className={`metric-grid ${compact ? "metric-grid-compact" : ""} ${className}`}
      style={{ "--metric-columns": items.length } as CSSProperties}
      aria-label={label}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt>
            {item.icon}
            {item.label}
          </dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
