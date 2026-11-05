import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { exportsFixture } from "../tests/exports-fixture.ts";
import { createHandler } from "../src/server/worker.ts";
const origin = "http://localhost:3101";
await fetch(origin);
const f = await exportsFixture(),
  update = process.env.HIMMAH_UPDATE_DESIGN === "1",
  captures = [],
  errors = [];
const artifacts = new URL("../.artifacts/custom-fields/", import.meta.url),
  baselines = new URL("../tests/design-baselines/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const organization = {
  id: f.org,
  name: "Synthetic Community",
  slug: "fields",
  role: "owner",
  timezone: "Europe/Brussels",
  createdAt: "2026-11-05T12:00Z",
};
for (const [label, kind, required, options] of [
  ["Preferred language", "choice", true, ["Nederlands", "Türkçe", "English"]],
  ["Extra information", "text", false, []],
  ["Number of years", "number", false, []],
  ["Start date", "date", false, []],
  ["Permission received", "boolean", true, []],
]) {
  const r = await f.people.fieldCommand("owner", f.org, crypto.randomUUID(), {
    operation: "create",
    label,
    kind,
    required,
    options,
  });
  assert.ok(r.id);
}
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

// Include the deployed routing layer, not just the People handler.
const worker = createHandler({
  fetch: async () =>
    Response.json({ user: { id: "owner", emailVerified: true } }),
  store: () => f.organizations,
  people: () => f.people,
});
const workerEnv = {
  HIMMAH_APP_ORIGIN: origin,
  HIMMAH_AUTH_URL: "https://auth.invalid",
  HIMMAH_DATABASE_URL: "isolated",
  HIMMAH_PEOPLE_ENABLED: "true",
  ONBOARDING_LIMITER: { limit: async () => ({ success: true }) },
  DIRECTORY_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async () => new Response("asset") },
};
const browser = await chromium.launch({
  executablePath: process.env.HIMMAH_CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  for (const [width, locale, enlarged = false] of [
    [390, "nl"],
    [320, "nl"],
    [320, "en"],
    [320, "tr"],
    [768, "nl"],
    [1280, "nl"],
    [320, "tr", true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
      timezoneId: "Europe/Brussels",
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
      const req = route.request(),
        u = new URL(req.url());
      let response;
      if (u.pathname.includes("/people/"))
        response = await worker(
          new Request(req.url(), {
            method: req.method(),
            headers: {
              "content-type": "application/json",
              cookie: "session=fixture",
              origin,
            },
            ...(req.method() !== "GET" ? { body: req.postData() } : {}),
          }),
          workerEnv,
        );
      else if (u.pathname === "/api/account")
        response = Response.json({
          user: {
            id: "owner",
            name: "Synthetic Owner",
            email: "owner@example.test",
            emailVerified: true,
          },
        });
      else if (u.pathname === "/api/organizations")
        response = Response.json({
          organizations: [organization],
          nextCursor: null,
        });
      else if (u.pathname === "/api/organizations/" + f.org)
        response = Response.json({ organization });
      else if (u.pathname.endsWith("/notifications/unread"))
        response = Response.json({ count: 0 });
      else if (u.pathname.includes("/learning/contacts/"))
        response = Response.json({ items: [], total: 0, nextCursor: null });
      else throw Error("Unexpected custom field request " + u.pathname);
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    const suffix = `${width}-${locale}${enlarged ? "-enlarged" : ""}`;
    await p.goto(`${origin}/workspace/${f.org}/custom-fields`);
    await p.locator(".directory-list strong").first().waitFor();
    await capture(p, `custom-fields-${suffix}`);
    const add = { en: "Add field", nl: "Veld toevoegen", tr: "Alan ekle" }[
      locale
    ];
    await p.getByRole("button", { name: add, exact: true }).click();
    await p.getByRole("dialog").waitFor();
    assert.equal(await p.locator("input:focus").count(), 0);
    await capture(p, `custom-field-editor-${suffix}`);
    await p.keyboard.press("Escape");
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    await p.goto(`${origin}/workspace/${f.org}/people/contacts/new`);
    await p.locator("#displayName").waitFor();
    await p.locator('[id^="custom-"]').first().waitFor();
    assert.equal(await p.locator("input:focus,select:focus").count(), 0);
    await capture(p, `custom-contact-form-${suffix}`);
    await p.locator('form button[type="submit"]').scrollIntoViewIfNeeded();
    await capture(p, `custom-contact-form-end-${suffix}`);
    if (width === 390 && locale === "nl") {
      await p.locator("#displayName").fill("Synthetic custom-field contact");
      await p
        .locator('select[id^="custom-"]')
        .first()
        .selectOption("Nederlands");
      await p.locator('select[id^="custom-"]').last().selectOption("false");
      const numberField = p.locator('input[id^="custom-"][type="number"]');
      await numberField.pressSequentially("-1.5");
      assert.equal(
        await numberField.inputValue(),
        "-1.5",
        "Negative decimal entry remains editable",
      );
      await p.locator('input[id^="custom-"][type="number"]').fill("0");
      await p.locator('input[id^="custom-"][type="date"]').fill("2026-11-05");
      await p
        .locator('input[id^="custom-"][type="text"]')
        .fill("Additional information");
      await p.locator('form button[type="submit"]').click();
      try {
        await p.locator(".custom-value-summary").waitFor({ timeout: 5000 });
      } catch (error) {
        await p.screenshot({
          path: new URL("custom-contact-save-error.png", artifacts).pathname,
        });
        throw error;
      }
      assert.ok(
        !new URL(p.url()).pathname.endsWith("/new"),
        "Save returns to contact profile",
      );
      const summary = await p.locator(".custom-value-summary").innerText();
      assert.ok(
        summary.includes("Nederlands") &&
          summary.includes("Nee") &&
          summary.includes("0"),
      );
      await p.locator(".custom-value-summary").scrollIntoViewIfNeeded();
      await capture(p, "custom-contact-profile-390-nl");
    }
    await context.close();
    if (process.env.HIMMAH_FIELDS_QUICK === "1") break;
  }
  assert.deepEqual(errors, []);
  console.log(
    `${captures.length} custom-field visual states passed; actual local People API/SQL, bounded forms, localization and no autofocus.`,
  );
} finally {
  await browser.close();
  await f.db.close();
}
