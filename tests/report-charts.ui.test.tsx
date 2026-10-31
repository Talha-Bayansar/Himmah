import { expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Users } from "lucide-react";
import { Statistic, StatisticPeriods } from "../src/insights/Statistic";
import TrendChart from "../src/insights/TrendChart";
import { setLocale } from "../src/paraglide/runtime.js";

it("opens a metric comparison with exact dates and values and closes accessibly", async () => {
  setLocale("en", { reload: false });
  const user = userEvent.setup();
  render(
    <StatisticPeriods
      value={{ current: "1–31 October", previous: "1–30 September" }}
    >
      <dl>
        <Statistic
          label="Visitors"
          value="12"
          current={12}
          previous={8}
          icon={Users}
        />
      </dl>
    </StatisticPeriods>,
  );
  const trigger = screen.getByRole("button", {
    name: "View Visitors comparison",
  });
  trigger.focus();
  await user.keyboard("{Enter}");
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByText("1–31 October")).toBeTruthy();
  expect(within(sheet).getByText("1–30 September")).toBeTruthy();
  expect(within(sheet).getByText("12", { exact: true })).toBeTruthy();
  expect(within(sheet).getByText("8", { exact: true })).toBeTruthy();
  expect(within(sheet).getByText(/50% higher/)).toBeTruthy();
  await user.click(
    within(sheet).getByRole("button", { name: "Close comparison" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("does not invent a previous value or graph for missing denominators", async () => {
  setLocale("en", { reload: false });
  render(
    <dl>
      <Statistic
        label="Average"
        value="—"
        current={null}
        previous={null}
        icon={Users}
      />
    </dl>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "View Average comparison" }),
  );
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).queryByRole("application")).toBeNull();
  expect(
    within(sheet).getAllByText(/No comparison yet/i).length,
  ).toBeGreaterThan(0);
});
it("switches trend measure and exposes selected period totals without hover", async () => {
  setLocale("en", { reload: false });
  render(
    <TrendChart
      data={[
        { date: "2026-10-01", visits: 8, unique: 5 },
        { date: "2026-10-08", visits: 12, unique: 9 },
      ]}
    />,
  );
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Measure"), "unique");
  await user.selectOptions(screen.getByLabelText("Period"), "2026-10-01");
  expect(screen.getByRole("status").textContent).toMatch(/8/);
  expect(screen.getByRole("status").textContent).toMatch(/5/);
  expect(
    document.querySelector('[data-slot="chart"]')?.getAttribute("aria-label"),
  ).toContain("Unique");
});
