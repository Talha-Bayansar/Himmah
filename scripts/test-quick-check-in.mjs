import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { exportsFixture } from "../tests/exports-fixture.ts";
import { createActivityStore } from "../src/server/activity-store.ts";
import { createAttendanceStore } from "../src/server/attendance-store.ts";
import { createHandler } from "../src/server/worker.ts";
const origin = "http://localhost:3101";
await fetch(origin);
const f = await exportsFixture(),
  dialect = new PgDialect();
const run = async (s) => {
  const q = dialect.sqlToQuery(s);
  return (await f.db.query(q.sql, q.params)).rows;
};
const activities = createActivityStore("", run),
  attendance = createAttendanceStore("", run);
const target = "88888888-8888-4888-8888-888888888888";
await f.db.query(
  `insert into hub_activity_sessions(id,organization_id,activity_id,name,topic,description,location,timezone,starts_at,ends_at,price_minor,created_by,creation_key) values($1,$2,$3,'Samen leren','Samen leren en ontmoeten','','','Europe/Brussels','2020-04-06T16:00:00Z','2020-04-06T17:00:00Z',1000,'owner',gen_random_uuid())`,
  [target, f.org, f.activity],
);
await f.db.query(
  `insert into hub_attendance(organization_id,activity_id,session_id,person_id,status) values($1,$2,$3,$4,'present')`,
  [f.org, f.activity, target, f.contacts[1]],
);
for (let i = 0; i < 27; i++)
  await f.db.query(
    `insert into himmah.contacts(organization_id,display_name,created_by,updated_by) values($1,$2,'owner','owner')`,
    [f.org, `Synthetic contact ${String(i + 1).padStart(2, "0")}`],
  );
// Distinct fixed timestamps keep visual row ordering independent of synthetic UUIDs.
await f.db.query(
  `update himmah.contacts c set created_at='2019-01-01'::timestamptz+x.n*interval '1 second' from(select id,row_number()over(order by display_name) as n from himmah.contacts where organization_id=$1)x where c.id=x.id`,
  [f.org],
);
const recent = "99999999-9999-4999-8999-999999999999";
await f.db.query(
  `insert into hub_activity_sessions(id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,created_by,creation_key) values($1,$2,$3,'Samen leren','','','Europe/Brussels','2020-04-01T16:00:00Z','2020-04-01T17:00:00Z','owner',gen_random_uuid())`,
  [recent, f.org, f.activity],
);
await f.db.query(
  `insert into hub_attendance(organization_id,activity_id,session_id,person_id,status)values($1,$2,$3,$4,'present')`,
  [f.org, f.activity, recent, f.contacts[0]],
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
  activities: () => activities,
  attendance: () => attendance,
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
const update = process.env.HIMMAH_UPDATE_DESIGN === "1";
const artifacts = new URL("../.artifacts/quick-check-in/", import.meta.url),
  baselines = new URL("../tests/design-baselines/", import.meta.url);
const captures = [],
  errors = [],
  writes = [];
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
    let loseResponse = false;
    await p.route("**/api/**", async (route) => {
      const r = route.request(),
        u = new URL(r.url());
      let response;
      if (u.pathname.endsWith("/notifications/unread"))
        response = Response.json({ count: 0 });
      else {
        if (r.method() === "POST") writes.push(JSON.parse(r.postData()));
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
        if (loseResponse && r.method() === "POST") {
          loseResponse = false;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          response = Response.json({ code: "service" }, { status: 503 });
        }
      }
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    const url = `${origin}/workspace/${f.org}/activities/${f.activity}/sessions/${target}/attendance`;
    await p.goto(url + "?checkIn=true");
    await p.locator(".check-in-row").first().waitFor();
    assert.equal(
      await p.locator("main input:focus").count(),
      0,
      "No opening autofocus",
    );
    assert.equal(
      await p
        .locator('.check-in-row[data-present="true"] button:disabled')
        .count(),
      1,
      "Already present is disabled",
    );
    const suffix = `${width}-${locale}${enlarged ? "-enlarged" : ""}`;
    await capture(p, "quick-check-in-" + suffix);
    const tabs = p.getByRole("tab");
    await tabs.nth(1).click();
    await p.waitForURL("**source=all**");
    await p.locator(".check-in-row").first().waitFor();
    await capture(p, "quick-check-in-all-" + suffix);
    if (width === 390) {
      // Reload retains the chosen source; search/pagination are server-backed.
      await p.reload();
      await p.getByRole("searchbox").fill("Synthetic contact");
      await p.waitForTimeout(200);
      assert.equal(await p.locator(".check-in-row").count(), 25);
      await p
        .locator("main")
        .getByRole("button", { name: "Meer laden" })
        .click();
      await p.waitForFunction(
        () => document.querySelectorAll(".check-in-row").length === 27,
      );
      await p.getByRole("searchbox").fill("");
      await p.getByRole("tab").first().click();
      await p.locator(".check-in-row").first().waitFor();
      loseResponse = true;
      const checkInButton = p.getByRole("button", {
        name: "Ayşe İrem van den Berg aanmelden",
        exact: true,
      });
      const beforeWidth = (await checkInButton.boundingBox()).width;
      await checkInButton.click();
      await p.locator('.check-in-row button[aria-busy="true"]').waitFor();
      assert.equal(
        (await checkInButton.boundingBox()).width,
        beforeWidth,
        "Pending action keeps button geometry",
      );
      await capture(p, "quick-check-in-pending-390");
      await p
        .getByRole("button", { name: "Opnieuw proberen", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Aanmelding ongedaan maken" })
        .waitFor();
      assert.deepEqual(
        writes[0],
        writes[1],
        "Lost response uses exact key/payload",
      );
      assert.equal(
        (
          await f.db.query(
            `select * from hub_registration_charges where session_id=$1`,
            [target],
          )
        ).rows.length,
        0,
        "Check-in creates no debt",
      );
      await capture(p, "quick-check-in-saved-390");
      await p
        .getByRole("button", { name: "Aanmelding ongedaan maken" })
        .click();
      await p
        .getByRole("alertdialog")
        .getByRole("button", { name: "Verwijderen", exact: true })
        .click();
      await p
        .getByRole("button", {
          name: "Ayşe İrem van den Berg aanmelden",
          exact: true,
        })
        .waitFor();
      await p.getByRole("button", { name: "Meerdere kiezen" }).click();
      await p.getByRole("dialog").waitFor();
      assert.equal(
        await p.getByRole("dialog").locator("input:focus").count(),
        0,
      );
      await capture(p, "quick-check-in-multiple-390");
      await p.keyboard.press("Escape");
      await p.getByRole("dialog").waitFor({ state: "hidden" });
      await p.getByRole("link", { name: "Aanwezigheid", exact: true }).click();
      await p.locator(".attendance-row").first().waitFor();
      await capture(p, "quick-check-in-return-390");
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    `${captures.length} quick-check-in states passed through Worker + real local SQL; retry, undo, pagination, no autofocus and no debt verified.`,
  );
} finally {
  await browser.close();
  await f.db.close();
}
