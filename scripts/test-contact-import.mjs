import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { installDatabase } from "../tests/database.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { peopleApi } from "../src/modules/people/api.ts";
const origin = "http://localhost:3101";
await fetch(origin);
const artifacts = new URL("../.artifacts/contact-import/", import.meta.url),
  baselines = new URL("../tests/design-baselines/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const update = process.env.HIMMAH_UPDATE_DESIGN === "1",
  captures = [],
  errors = [];
const db = new PGlite();
await installDatabase(db);
const dialect = new PgDialect();
const store = createPeopleStore("", async (s) => {
  const q = dialect.sqlToQuery(s);
  return (await db.query(q.sql, q.params)).rows;
});
const org = "11111111-1111-4111-8111-111111111111";
await db.query(
  "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Synthetic Community','imports','Europe/Brussels','owner',gen_random_uuid())",
  [org],
);
await db.query(
  "insert into hub_memberships(organization_id,user_id,role)values($1,'owner','owner')",
  [org],
);
const organization = {
  id: org,
  name: "Synthetic Community",
  slug: "imports",
  timezone: "Europe/Brussels",
  role: "owner",
  createdAt: "2026-11-01T10:00:00Z",
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
  for (const [width, locale, enlarged = false, long = false] of [
    [390, "en"],
    [320, "en"],
    [320, "nl"],
    [320, "tr"],
    [768, "nl"],
    [1280, "nl"],
    [320, "en", true],
    [320, "nl", true],
    [320, "tr", true],
    [320, "en", false, true],
  ]) {
    await db.exec("BEGIN");
    const existing = (
      await store.command("owner", org, "create", crypto.randomUUID(), {
        displayName: "Ayşe Example",
        givenName: null,
        familyName: null,
      })
    ).id;
    await store.command("owner", org, "archive", crypto.randomUUID(), {
      contactId: existing,
      version: 1,
    });
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
      timezoneId: "Europe/Brussels",
    });
    await context.addCookies([
      { name: "himmah_locale", value: locale, url: origin },
    ]);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    let mode = "normal",
      writes = [],
      lastRows;
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      let response;
      if (u.pathname.includes("/people/")) {
        const request = new Request(req.url(), {
          method: req.method(),
          headers: { "content-type": "application/json" },
          ...(req.method() === "POST" ? { body: req.postData() } : {}),
        });
        if (u.pathname.endsWith("commit")) writes.push(req.postDataJSON());
        if (u.pathname.endsWith("review")) lastRows = req.postDataJSON().rows;
        response = await peopleApi(
          request,
          { id: "owner", emailVerified: true },
          store,
        );
        if (
          mode === "uncertain" &&
          u.pathname.endsWith("commit") &&
          writes.length === 1
        ) {
          assert.equal(response.status, 200);
          response = Response.json({ code: "service" }, { status: 503 });
        }
      } else if (u.pathname === "/api/account")
        response = Response.json({
          user: {
            id: "owner",
            name: "Synthetic Owner",
            email: "owner@example.test",
            emailVerified: true,
          },
        });
      else if (u.pathname.endsWith("/notifications/unread"))
        response = Response.json({ count: 0 });
      else if (u.pathname === "/api/organizations")
        response = Response.json({
          organizations: [organization],
          nextCursor: null,
        });
      else if (u.pathname === "/api/organizations/" + org)
        response = Response.json({ organization });
      else throw Error("Unexpected fixture request " + u.pathname);
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: JSON.stringify(await response.json()),
      });
    });
    const suffix = `${width}-${locale}${enlarged ? "-enlarged" : ""}${long ? "-long" : ""}`;
    if (enlarged)
      await page.addInitScript(() => {
        const apply = () => {
          document.documentElement.style.fontSize = "125%";
        };
        if (document.documentElement) apply();
        else
          document.addEventListener("DOMContentLoaded", apply, { once: true });
      });
    const path = origin + `/workspace/${org}/people/contacts/import`;
    await page.goto(path);
    await page.locator("#import-file").waitFor();
    assert.equal(await page.locator("input:focus,select:focus").count(), 0);
    await capture(page, `import-upload-${suffix}`);
    const csv = `Name,Email,Phone\n${long ? "A".repeat(120) : "Alex Example"},alex@example.test,+32470123456\nAyşe Example,ayse@example.test,\nInvalid person,invalid,\n`;
    await page.locator("#import-file").setInputFiles({
      name: "synthetic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    const next = page.locator(".contact-import section > button");
    await next.click();
    await page.locator("#import-displayName").selectOption("0");
    await page.locator("#import-email").selectOption("1");
    await page.locator("#import-phone").selectOption("2");
    await capture(page, `import-columns-${suffix}`);
    await page
      .locator(
        '.contact-import input[type="checkbox"],.contact-import button[role="checkbox"]',
      )
      .check();
    await page
      .locator(".contact-import .directory-actions button")
      .last()
      .click();
    await page.locator(".import-row").first().waitFor();
    assert.equal(await page.locator(".import-row").count(), 2);
    assert.equal(
      await page
        .locator('.import-row button[role="checkbox"]')
        .nth(1)
        .getAttribute("aria-checked"),
      "false",
    );
    await capture(page, `import-review-${suffix}`);
    if (width === 390) {
      // Real SQL commit with the first success response deliberately lost: exact retry creates no duplicate.
      mode = "uncertain";
      await page
        .locator(".import-section > .directory-actions button")
        .last()
        .click();
      await page.getByRole("button", { name: "Try again" }).waitFor();
      await page.waitForTimeout(150);
      const visibleRetry = await page
        .getByRole("button", { name: "Try again" })
        .evaluate((e) => e.getBoundingClientRect().bottom);
      const navTop = await page
        .locator(".workspace-navigation")
        .evaluate((e) => e.getBoundingClientRect().top);
      assert.ok(
        visibleRetry <= navTop,
        "Retry stays above fixed phone navigation",
      );
      await capture(page, "import-unknown-390-en");
      await page.getByRole("button", { name: "Try again" }).click();
      await page.getByRole("heading", { name: "Import complete" }).waitFor();
      assert.deepEqual(writes[1], writes[0]);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from himmah.contacts where display_name='Alex Example'",
          )
        ).rows[0].n,
        1,
      );
      await capture(page, "import-complete-390-en");
    }
    await context.close();
    await db.exec("ROLLBACK");
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("report.json", artifacts),
    JSON.stringify({ captures, errors }, null, 2),
  );
  console.log(
    `${captures.length} contact-import visual states passed with actual local SQL/API; exact lost-response retry creates one contact.`,
  );
} finally {
  await browser.close();
  await db.close();
}
