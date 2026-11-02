import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/ui/chart";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { LearningInsights } from "./contracts";
export default function ScoreDistributionChart({
  distribution,
  selected,
  onSelect,
}: {
  distribution: LearningInsights["distribution"];
  selected: number;
  onSelect: (score: number) => void;
}) {
  const locale = useLocale()?.locale ?? "en";
  return (
    <ChartContainer
      className="report-chart"
      role="region"
      aria-label={m.learn_insights_distribution()}
      config={{
        count: {
          label: m.learn_insights_count_label(),
          color: "var(--primary)",
        },
      }}
    >
      <BarChart
        accessibilityLayer
        data={distribution}
        margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="score"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tickMargin={10}
          tickFormatter={(v) => Number(v).toLocaleString(locale)}
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
              hideLabel
              formatter={(v, _name, item) => (
                <span>
                  {m.learn_insights_bin({
                    score: Number(item.payload.score).toLocaleString(locale),
                    total: (distribution.length - 1).toLocaleString(locale),
                    count: Number(v).toLocaleString(locale),
                  })}
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="count"
          maxBarSize={48}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
          onClick={(entry) => {
            if (typeof entry.payload?.score === "number")
              onSelect(entry.payload.score);
          }}
        >
          {distribution.map((r) => (
            <Cell
              key={r.score}
              fill={
                r.score === selected
                  ? "var(--primary)"
                  : "var(--muted-foreground)"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
