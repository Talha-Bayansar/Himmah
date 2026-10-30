import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { Statistic } from "../src/insights/Statistic";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
function mount(
  current: number | null,
  previous: number | null,
  preference: "higher" | "lower" | "neutral" = "higher",
  points = false,
) {
  setLocale("en", { reload: false });
  return render(
    <LocaleProvider>
      <dl>
        <Statistic
          label="Attendance"
          value={current === null ? "Not available" : String(current)}
          current={current}
          previous={previous}
          icon={Users}
          preference={preference}
          points={points}
        />
      </dl>
    </LocaleProvider>,
  );
}
it("pairs color and directional icons with readable percentage comparisons and an accessible baseline", () => {
  const { container } = mount(18, 14);
  expect(screen.getByText("28.6% higher")).toBeTruthy();
  expect(screen.getByText("Previously: 14")).toBeTruthy();
  expect(
    container.querySelector('[data-tone="positive"] svg[aria-hidden="true"]'),
  ).toBeTruthy();
});
it("treats lower outstanding balances as favorable and higher balances as attention rather than success", () => {
  const { container, rerender } = mount(10, 20, "lower");
  expect(screen.getByText("50% lower")).toBeTruthy();
  expect(container.querySelector('[data-tone="positive"]')).toBeTruthy();
  rerender(
    <LocaleProvider>
      <dl>
        <Statistic
          label="Outstanding"
          value="20"
          current={20}
          previous={10}
          icon={Users}
          preference="lower"
        />
      </dl>
    </LocaleProvider>,
  );
  expect(screen.getByText("100% higher")).toBeTruthy();
  expect(container.querySelector('[data-tone="warning"]')).toBeTruthy();
});
it("shows zero-baseline increases without infinity or a fabricated 100 percent", () => {
  mount(5, 0);
  expect(screen.getByText("Up from zero")).toBeTruthy();
  expect(screen.queryByText(/100%|Infinity|NaN/)).toBeNull();
});
it("uses percentage points for ratios without judging returning-share changes", () => {
  const { container } = mount(80, 60, "neutral", true);
  expect(screen.getByText("20 pp higher")).toBeTruthy();
  expect(container.querySelector('[data-tone="neutral"]')).toBeTruthy();
  expect(screen.getByText("Previously: 60%")).toBeTruthy();
});
it("distinguishes unchanged from unavailable comparisons", () => {
  const { rerender } = mount(0, 0);
  expect(screen.getByText("No change")).toBeTruthy();
  rerender(
    <LocaleProvider>
      <dl>
        <Statistic
          label="Average"
          value="Not available"
          current={null}
          previous={0}
          icon={Users}
        />
      </dl>
    </LocaleProvider>,
  );
  expect(screen.getByText("No comparison yet")).toBeTruthy();
  expect(screen.getByText("Not available")).toBeTruthy();
});
