import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { makeFutsalPlan, trainingBenefit } from "../src/domain/futsal-setup.ts";
import { defaultSettings, futsalCalendar } from "../src/futsal/contracts.ts";
const entries = ["Atlas", "Hilal", "Nur", "Safa"];
const examples = [];
for (const mode of ["club_manager", "team_league"] as const)
  for (const format of ["league", "tournament"] as const) {
    const settings = {
      ...defaultSettings("Europe/Brussels"),
      mode,
      format,
      entryCount: 4,
      playersPerTeam: mode === "club_manager" ? 1 : 3,
      squadSize: mode === "club_manager" ? 7 : 5,
      preparationStartsAt: "2026-11-01T08:00:00.000Z",
      startsAt: "2026-11-15T19:00:00.000Z",
      endsAt: "2026-12-31T22:00:00.000Z",
      roundEveryDays: 7,
      trainingEveryDays: 7,
      legs: 1,
    };
    const plan = makeFutsalPlan(
      settings,
      entries,
      "himmah-rehearsal-2026",
      futsalCalendar(settings.timezone),
    );
    assert.deepEqual(
      plan,
      makeFutsalPlan(
        settings,
        entries,
        "himmah-rehearsal-2026",
        futsalCalendar(settings.timezone),
      ),
    );
    assert.equal(plan.matchCount, format === "league" ? 6 : 3);
    assert.equal(plan.rounds.length, format === "league" ? 3 : 2);
    examples.push({
      mode,
      format,
      settings,
      entries: entries.map((name, i) => ({
        name,
        participants: Array.from(
          { length: settings.playersPerTeam },
          (_, j) => `Test participant ${i * settings.playersPerTeam + j + 1}`,
        ),
      })),
      plan,
      trainingChancePreview: [0, 10, 30, 60, 100].map((points) => ({
        points,
        ...trainingBenefit(points, settings),
      })),
    });
  }
writeFileSync(
  new URL("../docs/test-results/futsal-example-plans.json", import.meta.url),
  JSON.stringify(
    {
      scope:
        "Setup and formula previews only. No match scores, training outcomes, standings or winner are simulated.",
      examples,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  examples.map(({ mode, format, plan }) => ({
    mode,
    format,
    rounds: plan.rounds.length,
    matches: plan.matchCount,
    trainingWindows: plan.trainingAt.length,
    firstRound: plan.rounds[0],
  })),
);
