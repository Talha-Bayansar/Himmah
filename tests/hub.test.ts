import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleWorkspaces,
  saveAttendance,
  totalPoints,
  awardPoints,
  publishActivity,
  register,
  validateDraft,
  type ActivityDraft,
} from "../src/hub/model.ts";
const seed = () => sampleWorkspaces()[0]!;
test("confirmed presence grants once; retry and re-saving preserve totals", () => {
  const w = seed();
  const a = w.activities[0]!;
  const next = saveAttendance(
    w,
    a.id,
    { yusuf: "present" },
    a.revision,
    "attendance-1",
    "",
  );
  assert.equal(totalPoints(next, "yusuf"), 55);
  assert.deepEqual(
    saveAttendance(next, a.id, { yusuf: "present" }, 0, "attendance-1", ""),
    next,
  );
  const again = saveAttendance(
    next,
    a.id,
    { yusuf: "present" },
    1,
    "attendance-2",
    "",
  );
  assert.equal(totalPoints(again, "yusuf"), 55);
});
test("correcting attendance reverses only its award, preserving manual contributions", () => {
  const initial = saveAttendance(
    seed(),
    "youth-evening",
    { yusuf: "present" },
    0,
    "one",
    "",
  );
  assert.throws(
    () =>
      saveAttendance(
        initial,
        "youth-evening",
        { yusuf: "absent" },
        1,
        "two",
        "",
      ),
    /reason/,
  );
  const corrected = saveAttendance(
    initial,
    "youth-evening",
    { yusuf: "absent" },
    1,
    "two",
    "Incorrect check-in",
  );
  assert.equal(totalPoints(corrected, "yusuf"), 45);
  assert.equal(corrected.awards.length, 6);
  assert.equal(corrected.awards.at(-1)?.amount, -10);
  assert.equal(corrected.awards.at(-1)?.reason, "Attendance corrected");
  assert.equal(corrected.awards.at(-1)?.staffReason, "Incorrect check-in");
  const restored = saveAttendance(
    corrected,
    "youth-evening",
    { yusuf: "present" },
    2,
    "three",
    "Actually present",
  );
  assert.equal(totalPoints(restored, "yusuf"), 55);
});
test("attendance-only and manual-only activities never award automatically", () => {
  for (const id of ["community", "football"]) {
    const next = saveAttendance(seed(), id, { yusuf: "present" }, 0, id, "");
    assert.equal(totalPoints(next, "yusuf"), 45);
  }
});
test("manual bulk grants deduplicate recipient IDs and request retries", () => {
  const next = awardPoints(
    seed(),
    ["yusuf", "adam", "yusuf"],
    15,
    "Helped prepare lunch",
    "manual",
  );
  assert.equal(totalPoints(next, "yusuf"), 60);
  assert.equal(totalPoints(next, "adam"), 25);
  assert.deepEqual(
    awardPoints(next, ["yusuf", "adam"], 15, "Helped prepare lunch", "manual"),
    next,
  );
  assert.throws(
    () => awardPoints(next, ["sami"], 10, "Different mosque", "cross"),
    /workspace/,
  );
  assert.throws(
    () => awardPoints(next, ["adam"], 101, "Too much", "cap"),
    /1–100/,
  );
});
test("stale roster edits and cross-workspace members are rejected", () => {
  assert.throws(
    () =>
      saveAttendance(
        seed(),
        "youth-evening",
        { yusuf: "present" },
        5,
        "stale",
        "",
      ),
    /changed/,
  );
  assert.throws(
    () =>
      saveAttendance(
        seed(),
        "youth-evening",
        { sami: "present" },
        0,
        "cross",
        "",
      ),
    /eligible/,
  );
});
const draft: ActivityDraft = {
  title: "Hall helpers",
  description: "Help out",
  location: "Hall",
  date: "2026-10-24",
  time: "12:00",
  endTime: "13:00",
  group: "All youth",
  mode: "none",
  points: 50,
  registration: true,
  capacity: 1,
};
test("activity publication validates, is retry safe and ignores points for no-points mode", () => {
  assert.ok(validateDraft({ ...draft, title: "" }).length);
  assert.ok(validateDraft({ ...draft, endTime: "11:00" }).length);
  assert.ok(validateDraft({ ...draft, date: "2026-02-31" }).length);
  assert.ok(validateDraft({ ...draft, time: "25:00" }).length);
  const next = publishActivity(seed(), draft, "new-activity");
  assert.equal(next.activities.at(-1)?.points, 0);
  assert.equal(
    publishActivity(next, draft, "new-activity").activities.length,
    4,
  );
});
test("registration respects capacity and does not award points", () => {
  let w = publishActivity(seed(), draft, "new");
  w = register(w, "new", "yusuf");
  assert.equal(totalPoints(w, "yusuf"), 45);
  assert.throws(() => register(w, "new", "adam"), /full/);
  w = register(w, "new", "yusuf");
  assert.equal(w.activities.at(-1)?.registered.length, 0);
});
test("organizations have independent histories and activities", () => {
  const [a, b] = sampleWorkspaces();
  const updated = awardPoints(a!, ["yusuf"], 20, "Help", "op");
  assert.equal(totalPoints(updated, "yusuf"), 65);
  assert.equal(b!.awards.length, 0);
  assert.throws(() => register(b!, "youth-evening", "sami"), /not available/);
});
