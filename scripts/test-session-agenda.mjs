import { chromium } from "playwright-core";
import sharp from "sharp";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PgDialect } from "drizzle-orm/pg-core";
import { exportsFixture } from "../tests/exports-fixture.ts";
import { createHandler } from "../src/server/worker.ts";
import { createDashboardStore } from "../src/server/dashboard-store.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
const origin = "http://localhost:3101";
await fetch(origin);
const f = await exportsFixture(),
  dialect = new PgDialect();
const run = async (s) => {
  const q = dialect.sqlToQuery(s);
  return (await f.db.query(q.sql, q.params)).rows;
};
for (const [id, title, start, end] of [
  [
    "66666666-6666-4666-8666-666666666666",
    "Een volgende bijeenkomst",
    "2099-01-01T18:00:00Z",
    "2099-01-01T19:00:00Z",
  ],
  [
    "77777777-7777-4777-8777-777777777777",
    "Een recent gesprek",
    "2020-04-06T18:00:00Z",
    "2020-04-06T19:00:00Z",
  ],
  [
    "88888888-8888-4888-8888-888888888888",
    "Een oudere bijeenkomst",
    "2019-04-06T18:00:00Z",
    "2019-04-06T19:00:00Z",
  ],
])
  await f.db.query(
    `insert into hub_activity_sessions(id,organization_id,activity_id,name,topic,description,location,timezone,starts_at,ends_at,created_by,creation_key)values($1,$2,$3,'Samen leren',$4,'','Grote zaal','Europe/Brussels',$5,$6,'owner',gen_random_uuid())`,
    [id, f.org, f.activity, title, start, end],
  );
const user = {
  id: "owner",
  name: "Synthetic Owner",
  email: "owner@example.test",
  emailVerified: true,
};
const worker = createHandler({
  fetch: async () => Response.json({ user }),
  store: () => f.organizations,
  people: () => f.people,
  dashboard: () => createDashboardStore("", run),
  activities: () => createActivityStore("", run),
  attendance: () => createAttendanceStore("", run),
});
const env = {
  HIMMAH_APP_ORIGIN: origin,
  HIMMAH_AUTH_URL: "https://auth.invalid",
  HIMMAH_DATABASE_URL: "isolated",
  HIMMAH_PEOPLE_ENABLED: "true",
  ONBOARDING_LIMITER: { limit: async () => ({ success: true }) },
  DIRECTORY_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async () => new Response("asset") },
};
const update = process.env.HIMMAH_UPDATE_DESIGN === "1",
  artifacts = new URL("../.artifacts/session-agenda/", import.meta.url),
  baselines = new URL("../tests/design-baselines/", import.meta.url),
  captures = [],
  errors = [];
await mkdir(artifacts, { recursive: true });
async function capture(page, name) {
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    name + " overflow",
  );
  const png = await page.screenshot({ animations: "disabled" });
  await writeFile(new URL(name + ".png", artifacts), png);
  if (update) await writeFile(new URL(name + ".png", baselines), png);
  else {
    const a = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      b = await sharp(await readFile(new URL(name + ".png", baselines)))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    assert.deepEqual(a.info, b.info, name + " dimensions");
    let changed = 0;
    for (let i = 0; i < a.data.length; i += 4)
      if (
        Math.max(
          ...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c])),
        ) > 35
      )
        changed++;
    assert.ok(
      changed / (a.info.width * a.info.height) < 0.005,
      name + " drift " + changed,
    );
  }
  captures.push(name);
}

const browser = await chromium.launch({
  executablePath: process.env.HIMMAH_CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  for (const [width, locale, enlarged = false] of [
    [320, "en"],
    [320, "nl"],
    [320, "tr"],
    [390, "nl"],
    [768, "nl"],
    [1280, "nl"],
    [320, "tr", true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      timezoneId: "Europe/Brussels",
      reducedMotion: "reduce",
    });
    await context.addCookies([
      { name: "himmah_locale", value: locale, url: origin },
    ]);
    if (enlarged)
      await context.addInitScript(() =>
        document.addEventListener(
          "DOMContentLoaded",
          () => (document.documentElement.style.fontSize = "125%"),
          { once: true },
        ),
      );
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (route) => {
      const r = route.request();
      let response;
      if (new URL(r.url()).pathname.endsWith("/notifications/unread"))
        response = Response.json({ count: 0 });
      else
        response = await worker(
          new Request(r.url(), {
            method: r.method(),
            headers: {
              cookie: "session=fixture",
              origin,
              "content-type": "application/json",
            },
            ...(r.method() !== "GET" ? { body: r.postData() } : {}),
          }),
          env,
        );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    const url = `${origin}/workspace/${f.org}/schedule`;
    const suffix = `${width}-${locale}${enlarged ? "-enlarged" : ""}`;
    await p.goto(url);
    await p.getByText("Een volgende bijeenkomst", { exact: true }).waitFor();
    assert.equal(await p.locator("input:focus").count(), 0);
    await capture(p, "session-agenda-upcoming-" + suffix);
    await p.getByRole("tab").nth(1).click();
    await p.getByText("Een recent gesprek", { exact: true }).waitFor();
    assert.ok(
      (
        await p.locator(".planned-sessions .directory-item").first().innerText()
      ).includes("Een recent gesprek"),
    );
    await capture(p, "session-agenda-recent-" + suffix);
    if (width === 390) {
      await p.reload();
      await p.getByText("Een recent gesprek", { exact: true }).waitFor();
      assert.equal(
        await p.getByRole("tab").nth(1).getAttribute("aria-selected"),
        "true",
      );
      await p.getByRole("searchbox").fill("recent gesprek");
      await p.waitForTimeout(200);
      assert.equal(
        await p.locator(".planned-sessions .directory-item").count(),
        1,
      );
      await capture(p, "session-agenda-search-390");
      await p
        .getByRole("link")
        .filter({ hasText: "Een recent gesprek" })
        .click();
      await p.locator(".attendance-page h1").waitFor();
      assert.ok(p.url().includes("/attendance"));
      await capture(p, "session-agenda-attendance-390");
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    `${captures.length} session-agenda states passed through Worker + real SQL; mode/reload/search/order/direct attendance and no autofocus/overflow verified.`,
  );
} finally {
  await browser.close();
  await f.db.close();
}
