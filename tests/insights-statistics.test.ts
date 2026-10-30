import test from "node:test";
import assert from "node:assert/strict";
import {
  comparisonRange,
  metricChange,
  perSession,
  share,
} from "../src/insights/statistics.ts";

test("Monthly comparison matches elapsed calendar days and handles leap years and year boundaries", () => {
  assert.deepEqual(comparisonRange({ from: "2026-02-01", to: "2026-02-28" }), {
    from: "2026-01-01",
    to: "2026-01-31",
    kind: "month",
  });
  assert.deepEqual(comparisonRange({ from: "2026-10-01", to: "2026-10-30" }), {
    from: "2026-09-01",
    to: "2026-09-30",
    kind: "month",
  });
  assert.deepEqual(comparisonRange({ from: "2026-03-01", to: "2026-03-31" }), {
    from: "2026-02-01",
    to: "2026-02-28",
    kind: "month",
  });
  assert.deepEqual(comparisonRange({ from: "2024-03-01", to: "2024-03-31" }), {
    from: "2024-02-01",
    to: "2024-02-29",
    kind: "month",
  });
  assert.deepEqual(comparisonRange({ from: "2026-01-01", to: "2026-01-10" }), {
    from: "2025-12-01",
    to: "2025-12-10",
    kind: "month",
  });
  assert.deepEqual(comparisonRange({ from: "2026-03-30", to: "2026-03-31" }), {
    from: "2026-03-28",
    to: "2026-03-29",
    kind: "period",
  });
  assert.deepEqual(comparisonRange({ from: "2026-02-01", to: "2026-03-01" }), {
    from: "2026-01-03",
    to: "2026-01-31",
    kind: "period",
  });
});
test("Changes separate direction from desirability and never manufacture percentages from zero", () => {
  assert.equal(metricChange(18, 14)?.change, 28.6);
  assert.equal(metricChange(18, 14)?.tone, "positive");
  assert.equal(metricChange(10, 20)?.tone, "warning");
  assert.equal(metricChange(10, 20, "lower")?.tone, "positive");
  assert.equal(metricChange(20, 10, "lower")?.tone, "warning");
  assert.equal(metricChange(20, 10, "neutral")?.tone, "neutral");
  assert.equal(metricChange(0, 10)?.change, -100);
  assert.equal(metricChange(5, 0)?.change, null);
  assert.equal(metricChange(0, 0)?.direction, "same");
  assert.equal(metricChange(5, undefined), null);
  assert.equal(metricChange(null, 5), null);
  assert.equal(metricChange(NaN, 5), null);
  assert.equal(metricChange(80, 60, "higher", true)?.change, 20);
  assert.equal(metricChange(80.01, 80, "higher", true)?.direction, "same");
});
test("Useful derived statistics require their actual denominators", () => {
  assert.equal(perSession(18, 3), 6);
  assert.equal(perSession(0, 3), 0);
  assert.equal(perSession(0, 0), null);
  assert.equal(share(1, 4), 25);
  assert.equal(share(0, 12), 0);
  assert.equal(share(0, 0), null);
});
