import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/ui/chart";
import { m } from "../paraglide/messages.js";
export default function ComparisonChart({
  current,
  previous,
  currentValue,
  previousValue,
}: {
  current: number;
  previous: number;
  currentValue: string;
  previousValue: string;
}) {
  const data = [
    { period: m.chart_previous(), value: previous, formatted: previousValue },
    { period: m.chart_current(), value: current, formatted: currentValue },
  ];
  return (
    <ChartContainer
      className="report-chart comparison-chart"
      config={{ value: { label: m.chart_value(), color: "var(--primary)" } }}
      aria-label={m.chart_comparison()}
    >
      <BarChart
        data={data}
        accessibilityLayer
        margin={{ left: 0, right: 12, top: 12, bottom: 8 }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
        />
        <YAxis hide domain={[0, "auto"]} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(_v, _n, item) => (
                <span>
                  {item.payload.period}: {item.payload.formatted}
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="value"
          radius={[4, 4, 0, 0]}
          maxBarSize={72}
          isAnimationActive={false}
        >
          <Cell fill="var(--muted-foreground)" />
          <Cell fill="var(--primary)" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
