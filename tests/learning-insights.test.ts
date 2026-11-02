import test from "node:test";
import assert from "node:assert/strict";
import { learningInsightsFixture } from "./learning-insights-fixture.ts";
import { learningApi } from "../src/server/learning-api.ts";
import type { LearningInsights } from "../src/learning/contracts.ts";

test("quiz insights use one latest submission per entry, preserve zeros/history and bound immutable question aggregates", async () => {
  const f = await learningInsightsFixture();
  try {
    const get = async (publication = f.publication) =>
      (await f.store.insights(
        "owner",
        f.org,
        f.item,
        publication,
      )) as LearningInsights;
    const before = (
      await f.db.query(
        "select (select count(*) from hub_learning_attempts) as attempts,(select count(*) from hub_directory_audit) as audit",
      )
    ).rows;
    const report = await get();
    assert.equal(report.mode, "assigned");
    assert.equal(report.questionCount, 2);
    assert.equal(report.participants, 4);
    assert.equal(report.completed, 2);
    assert.equal(report.averageScore, 0.5);
    assert.equal(report.inProgress, 2);
    assert.equal(report.notStarted, 1);
    assert.equal(report.revoked, 1);
    assert.deepEqual(report.distribution, [
      { score: 0, count: 1 },
      { score: 1, count: 1 },
      { score: 2, count: 0 },
    ]);
    assert.deepEqual(
      report.questions.map(({ correct, incorrect, unanswered }) => ({
        correct,
        incorrect,
        unanswered,
      })),
      [
        { correct: 1, incorrect: 0, unanswered: 1 },
        { correct: 0, incorrect: 1, unanswered: 1 },
      ],
    );
    assert.deepEqual(report.questions[0]!.choices, [
      { text: f.content.questions[0]!.choices[0], correct: false, count: 0 },
      { text: f.content.questions[0]!.choices[1], correct: true, count: 1 },
    ]);
    for (const question of report.questions)
      assert.equal(
        question.correct + question.incorrect + question.unanswered,
        report.completed,
      );
    assert.equal(report.questions[0]!.text, f.content.questions[0]!.text);
    assert.ok(Number.isFinite(Date.parse(report.generatedAt)));
    const empty = await get(f.emptyPublication);
    assert.equal(empty.questionCount, 1);
    assert.equal(empty.participants, 0);
    assert.equal(empty.averageScore, null);
    assert.equal(empty.distribution.length, 2);
    assert.equal(empty.questions[0]!.choices[0]!.correct, true);
    const guest = await get(f.guestPublication);
    assert.equal(guest.mode, "open");
    assert.equal(guest.participants, 1);
    assert.equal(guest.completed, 1);
    assert.equal(guest.averageScore, 0);
    assert.equal(guest.questions[0]!.incorrect, 1);
    assert.doesNotMatch(
      JSON.stringify(report),
      /Person 0|guest_hash|link_hash|recipientId|answers|correctAnswer/,
    );
    assert.deepEqual(
      (
        await f.db.query(
          "select (select count(*) from hub_learning_attempts) as attempts,(select count(*) from hub_directory_audit) as audit",
        )
      ).rows,
      before,
    );
    // The maximum publication size remains bounded and unattempted questions are not a fabricated score.
    await f.command("save", {
      content: {
        ...f.content,
        questions: Array.from({ length: 50 }, (_, i) => ({
          ...f.content.questions[0]!,
          text: `Question ${i + 1}`,
          choices: ["A", "B", "C", "D", "E", "F"],
        })),
      },
      activity: null,
      session: null,
    });
    const large = await f.command("publish");
    const bounded = await get(large.publication);
    assert.equal(bounded.questions.length, 50);
    assert.equal(bounded.distribution.length, 51);
    assert.equal(bounded.questions[49]!.choices.length, 6);
    assert.equal(bounded.averageScore, null);
  } finally {
    await f.db.close();
  }
});

test("quiz insights independently enforce API and SQL owner/admin, tenant, item and publication scope", async () => {
  const f = await learningInsightsFixture();
  try {
    for (const [actor, org, item, pub] of [
      ["helper", f.org, f.item, f.publication],
      ["outsider", f.org, f.item, f.publication],
      ["owner", f.foreign, f.item, f.publication],
      ["owner", f.org, crypto.randomUUID(), f.publication],
      ["owner", f.org, f.item, crypto.randomUUID()],
    ])
      assert.equal(await f.store.insights(actor!, org!, item!, pub!), null);
    assert.equal(
      (await f.store.insights("admin", f.org, f.item, f.publication))
        ?.completed,
      2,
    );
    const call = (
      user = "owner",
      org = f.org,
      item = f.item,
      pub = f.publication,
      verified = true,
      method = "GET",
    ) =>
      learningApi(
        new Request(
          `https://himmah.test/api/organizations/${org}/learning/${item}/insights?publication=${pub}`,
          { method },
        ),
        { id: user, emailVerified: verified },
        f.organizations,
        f.store,
      );
    const response = await call();
    assert.equal(response?.status, 200);
    assert.equal(response?.headers.get("cache-control"), "no-store");
    assert.equal((await response!.json()).completed, 2);
    assert.equal((await call("admin"))?.status, 200);
    assert.equal((await call("helper"))?.status, 403);
    assert.equal(
      (await call("owner", f.org, f.item, f.publication, false))?.status,
      403,
    );
    assert.equal((await call("outsider"))?.status, 404);
    assert.equal((await call("owner", f.foreign))?.status, 404);
    assert.equal(
      (await call("owner", f.org, crypto.randomUUID()))?.status,
      404,
    );
    assert.equal(
      (await call("owner", f.org, f.item, crypto.randomUUID()))?.status,
      404,
    );
    assert.equal((await call("owner", f.org, f.item, "bad"))?.status, 400);
    assert.equal(
      (await call("owner", f.org, f.item, f.publication, true, "POST"))?.status,
      404,
    );
    // Current access must still be checked after a successful report read.
    await f.db.query(
      "delete from hub_memberships where organization_id=$1 and user_id='admin'",
      [f.org],
    );
    assert.equal(
      await f.store.insights("admin", f.org, f.item, f.publication),
      null,
    );
    assert.equal((await call("admin"))?.status, 404);
  } finally {
    await f.db.close();
  }
});
