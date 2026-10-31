import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/ui/chart";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Label } from "../components/ui/label";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { InsightsReport } from "./contracts";

export default function TrendChart({
  data,
}: {
  data: InsightsReport["trend"];
}) {
  const locale = useLocale()?.locale ?? "en";
  const [metric, setMetric] = useState<"visits" | "unique">("visits");
  const [selected, setSelected] = useState("");
  const date = (v: string, short = false) =>
    new Intl.DateTimeFormat(locale, {
      ...(short
        ? ({ month: "short", day: "numeric" } as const)
        : ({ dateStyle: "medium" } as const)),
      timeZone: "UTC",
    }).format(new Date(v + "T12:00:00Z"));
  const point = data.find((p) => p.date === selected) ?? data.at(-1);
  const label = metric === "visits" ? m.insights_visits() : m.insights_unique();
  return (
    <div className="report-trend">
      <div className="report-chart-controls">
        <div>
          <Label htmlFor="trend-metric">{m.chart_measure()}</Label>
          <NativeSelect
            id="trend-metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as typeof metric)}
          >
            <NativeSelectOption value="visits">
              {m.insights_visits()}
            </NativeSelectOption>
            <NativeSelectOption value="unique">
              {m.insights_unique()}
            </NativeSelectOption>
          </NativeSelect>
        </div>
        {point && (
          <div>
            <Label htmlFor="trend-selection">{m.chart_period()}</Label>
            <NativeSelect
              id="trend-selection"
              value={point.date}
              onChange={(e) => setSelected(e.target.value)}
            >
              {data.map((p) => (
                <NativeSelectOption key={p.date} value={p.date}>
                  {date(p.date)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>
      {data.length ? (
        <>
          <ChartContainer
            className="report-chart"
            role="region"
            config={{ [metric]: { label, color: "var(--primary)" } }}
            aria-label={`${m.insights_trend()} · ${label}`}
          >
            <BarChart
              accessibilityLayer
              data={data}
              margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => date(String(v), true)}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                tickMargin={10}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v) => Number(v).toLocaleString(locale)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) => date(String(v))}
                    formatter={(v) => (
                      <span>
                        {label}: {Number(v).toLocaleString(locale)}
                      </span>
                    )}
                  />
                }
              />
              <Bar
                dataKey={metric}
                onClick={(entry) => {
                  if (typeof entry.payload?.date === "string")
                    setSelected(entry.payload.date);
                }}
                fill={`var(--color-${metric})`}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
          <p className="report-chart-selection" role="status">
            {point && (
              <>
                <strong>{date(point.date)}</strong>
                <span>
                  {m.insights_period_counts({
                    visits: point.visits.toLocaleString(locale),
                    unique: point.unique.toLocaleString(locale),
                  })}
                </span>
              </>
            )}
          </p>
          <p className="activity-note">{m.chart_interaction()}</p>
        </>
      ) : (
        <p className="directory-empty">{m.insights_empty()}</p>
      )}
    </div>
  );
}
