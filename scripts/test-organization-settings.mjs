import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { exportsFixture } from "../tests/exports-fixture.ts";
import { createOrganizationSettingsStore } from "../src/server/organization-settings-store.ts";
import { createHandler } from "../src/server/worker.ts";
const origin = "http://localhost:3101";
await fetch(origin);
const f = await exportsFixture(),
  update = process.env.HIMMAH_UPDATE_DESIGN === "1",
  captures = [],
  errors = [];
const artifacts = new URL(
    "../.artifacts/organization-settings/",
    import.meta.url,
  ),
  baselines = new URL("../tests/design-baselines/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const dialect = new PgDialect();
const settings = createOrganizationSettingsStore("", async (s) => {
  const q = dialect.sqlToQuery(s);
  return (await f.db.query(q.sql, q.params)).rows;
});
const user = {
  id: "owner",
  name: "Synthetic Owner",
  email: "owner@example.test",
  emailVerified: true,
};
const worker = createHandler({
  fetch: async () => Response.json({ user }),
  store: () => f.organizations,
  organizationSettings: () => settings,
  exports: () => f.exports,
  people: () => f.people,
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
    [320, "nl"],
    [320, "en"],
    [320, "tr"],
    [768, "nl"],
    [1280, "nl"],
    [320, "tr", true],
    [390, "nl"],
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
      const r = route.request(),
        u = new URL(r.url());
      let response;
      if (u.pathname.endsWith("/notifications/unread"))
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
    await p.goto(`${origin}/workspace/${f.org}/organization`);
    await p.locator("#org-name").waitFor();
    assert.equal(await p.locator("input:focus,select:focus").count(), 0);
    const suffix = `${width}-${locale}${enlarged ? "-enlarged" : ""}`;
    await capture(p, `organization-settings-${suffix}`);
    await p.locator("#org-language").scrollIntoViewIfNeeded();
    await capture(p, `organization-settings-regional-${suffix}`);
    await p.locator('form button[type="submit"]').scrollIntoViewIfNeeded();
    await capture(p, `organization-settings-actions-${suffix}`);
    if (width === 390) {
      const timezoneTrigger = p.locator(".picker-trigger");
      await timezoneTrigger.click();
      const dialog = p.getByRole("dialog");
      await dialog.waitFor();
      assert.equal(await dialog.locator("input:focus").count(), 0);
      assert.equal(
        await dialog.locator('button[aria-pressed="true"]').count(),
        1,
      );
      const footer = await dialog.locator(".form-sheet-footer").boundingBox();
      assert.ok(
        footer && footer.y + footer.height <= 844,
        "Picker actions remain visible",
      );
      await capture(p, "organization-settings-timezone-picker-390");
      await p.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await p.locator("#org-name").fill("Updated synthetic community");
      await p.locator("#org-language").selectOption("tr");
      await p.locator("#org-quiet-start").fill("21:30");
      await p.locator("#org-quiet-end").fill("08:15");
      await p.locator('form button[type="submit"]').click();
      await p.waitForURL(`**/workspace/${f.org}/manage`);
      await capture(p, "organization-settings-saved-390");
      const current = await settings.read("owner", f.org);
      assert.equal(current.quietStart, 1290);
      assert.equal(current.quietEnd, 495);
      assert.equal(current.defaultLanguage, "tr");
      await p.goto(`${origin}/workspace/${f.org}/exports?kind=contacts`);
      await p.locator("#export-language").waitFor();
      assert.equal(await p.locator("#export-language").inputValue(), "tr");
      assert.equal(await p.locator("html").getAttribute("lang"), "nl");
      await p.locator("#export-language").scrollIntoViewIfNeeded();
      await capture(p, "organization-settings-export-language-390");
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    `${captures.length} organization-settings states passed through Worker + real local SQL; save, defaults, no autofocus and overflow verified.`,
  );
} finally {
  await browser.close();
  await f.db.close();
}
