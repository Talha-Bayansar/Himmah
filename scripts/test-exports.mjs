import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { exportsFixture } from "../tests/exports-fixture.ts";
import { exportApi } from "../src/server/export-api.ts";
import { insightsApi } from "../src/server/insights-api.ts";
import { peopleApi } from "../src/modules/people/api.ts";
const origin = "http://localhost:3101";
await fetch(origin);
const f = await exportsFixture();
const update = process.env.HIMMAH_UPDATE_DESIGN === "1",
  captures = [],
  errors = [];
const artifacts = new URL("../.artifacts/exports/", import.meta.url),
  baselines = new URL("../tests/design-baselines/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const organization = {
  id: f.org,
  name: "Synthetic Community",
  slug: "export-visual",
  timezone: "Europe/Brussels",
  role: "owner",
  createdAt: "2026-11-04T12:00:00Z",
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
    [390, "nl"],
    [320, "en"],
    [320, "nl"],
    [320, "tr"],
    [768, "nl"],
    [1280, "nl"],
    [320, "en", true],
    [320, "nl", true],
    [320, "tr", true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
      timezoneId: "Europe/Brussels",
      acceptDownloads: true,
    });
    await context.addCookies([
      { name: "himmah_locale", value: locale, url: origin },
    ]);
    await context.addInitScript(
      ({ enlarged }) => {
        const RealDate = Date;
        globalThis.Date = class extends RealDate {
          constructor(...args) {
            super(...(args.length ? args : ["2026-11-04T12:00:00Z"]));
          }
          static now() {
            return new RealDate("2026-11-04T12:00:00Z").getTime();
          }
        };
        if (enlarged)
          document.addEventListener(
            "DOMContentLoaded",
            () => {
              document.documentElement.style.fontSize = "125%";
            },
            { once: true },
          );
      },
      { enlarged },
    );
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    let mode = "normal",
      files = 0,
      release;
    await p.route("**/api/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      let response;
      const request = new Request(req.url(), {
        method: req.method(),
        headers: { "content-type": "application/json" },
        ...(req.method() !== "GET" ? { body: req.postData() } : {}),
      });
      if (u.pathname.includes("/exports")) {
        if (!u.pathname.endsWith("/context")) {
          files++;
          if (mode === "pending")
            await new Promise((resolve) => {
              release = resolve;
            });
          if (mode === "limit") {
            response = Response.json({ code: "export_limit" }, { status: 413 });
          } else if (mode === "error") {
            response = Response.json({ code: "service" }, { status: 503 });
          } else if (mode === "denied") {
            response = Response.json({ code: "forbidden" }, { status: 403 });
          }
        }
        response ??= await exportApi(
          request,
          { id: "owner", emailVerified: true },
          f.organizations,
          f.exports,
        );
      } else if (u.pathname.includes("/insights"))
        response = await insightsApi(
          request,
          { id: "owner", emailVerified: true },
          f.organizations,
          f.insights,
        );
      else if (u.pathname.includes("/people/"))
        response = await peopleApi(
          request,
          { id: "owner", emailVerified: true },
          f.people,
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
      else if (u.pathname.endsWith("/notifications/unread"))
        response = Response.json({ count: 0 });
      else if (u.pathname === "/api/organizations")
        response = Response.json({
          organizations: [organization],
          nextCursor: null,
        });
      else if (u.pathname === "/api/organizations/" + f.org)
        response = Response.json({ organization });
      else throw Error("Unexpected export fixture request " + u.pathname);
      if (!response) throw Error("Unhandled fixture " + u.pathname);
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: response.body
          ? Buffer.from(await response.arrayBuffer())
          : undefined,
      });
    });
    const suffix = `${width}-${locale}${enlarged ? "-enlarged" : ""}`;
    const kinds = enlarged
      ? ["contacts", "balances", "insights-summary"]
      : width === 768 || width === 1280
        ? ["contacts", "balances"]
        : [
            "contacts",
            "attendance",
            "balances",
            "cash",
            "insights-summary",
            "insights-trend",
            "insights-activities",
          ];
    const base = `${origin}/workspace/${f.org}/exports`;
    const goto = async (kind, extra = "") => {
      await p.goto(
        base +
          `?kind=${kind}&from=2020-03-30&to=2020-03-31&locale=${locale}${extra}`,
      );
      await p.locator("#export-kind").waitFor();
      await p.locator(".exports-download:not([disabled])").waitFor();
      assert.equal(
        await p.locator("input:focus,select:focus").count(),
        0,
        "No export autofocus",
      );
    };
    for (const kind of kinds) {
      await goto(kind);
      assert.equal(files, 0, "Opening report never generates a file");
      await capture(p, `exports-${kind}-${suffix}`);
    }
    if (width === 390) {
      await goto("contacts");
      await p.locator(".exports-page details summary").click();
      await capture(p, "exports-help-390");
      await p.locator(".exports-page details summary").click();
      // An actual CSV file uses local SQL in one response, not just the loaded browser list.
      const download = p.waitForEvent("download");
      await p.locator(".exports-download").click();
      const file = await download;
      const path = await file.path();
      const text = await readFile(path, "utf8");
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      assert.equal(parsed.data.length, 3);
      assert.ok(text.includes("'=Synthetic formula"));
      assert.ok(text.includes("Ayşe"));
      assert.ok(file.suggestedFilename().endsWith("-nl.csv"));
      await p.locator('[role="status"]').waitFor();
      await capture(p, "exports-prepared-390");
      await goto("contacts", "&q=no-such-contact");
      const emptyDownload = p.waitForEvent("download");
      await p.locator(".exports-download").click();
      const emptyFile = await emptyDownload;
      const emptyText = await readFile(await emptyFile.path(), "utf8");
      assert.equal(
        Papa.parse(emptyText, { header: true, skipEmptyLines: true }).data
          .length,
        0,
      );
      await capture(p, "exports-empty-390");
      await goto("contacts");
      await p.goto(
        base +
          `?kind=attendance&from=2020-03-31&to=2020-03-30&locale=${locale}`,
      );
      await p.locator(".exports-invalid").waitFor();
      await capture(p, "exports-invalid-range-390");
      await p.locator(".exports-invalid > button").click();
      await p.locator(".exports-download:not([disabled])").waitFor();
      assert.equal(await p.locator("#export-kind").inputValue(), "attendance");
      await goto("contacts");
      // Browser failures retain filters; a retry is a fresh read.
      for (const state of ["limit", "error"]) {
        mode = state;
        await p.locator(".exports-download").click();
        await p.locator('[role="alert"]').waitFor();
        await capture(p, `exports-${state}-390`);
      }
      mode = "pending";
      await p.locator(".exports-download").click();
      await p.locator('.exports-download[aria-busy="true"]').waitFor();
      await capture(p, "exports-pending-390");
      release();
      await p.locator(".exports-download:not([disabled])").waitFor();
      mode = "normal";
      await goto(
        "attendance",
        `&activity=${f.activity}&session=${f.session}&origin=session`,
      );
      await capture(p, "exports-session-390");
      assert.equal(await p.locator("#export-from").count(), 0);
      await goto("balances");
      await p
        .locator("fieldset > .learning-field button[aria-label]")
        .last()
        .click();
      await p.getByRole("dialog").waitFor();
      await capture(p, "exports-group-picker-390");
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Historical study group" })
        .click();
      await p.locator(".exports-download:not([disabled])").waitFor();
      await capture(p, "exports-group-selected-390");
      mode = "denied";
      await p.locator(".exports-download").click();
      await p.locator(".exports-page").waitFor({ state: "hidden" });
      await capture(p, "exports-denied-390");
      mode = "normal";
      await p.goto(origin + `/workspace/${f.org}/manage`);
      await p.locator("main h1").waitFor();
      await capture(p, "exports-manage-entry-390");
      await p.locator(`a[href="/workspace/${f.org}/exports"]`).click();
      await p.locator("#export-kind").waitFor();
      await p.goto(origin + `/workspace/${f.org}/people/contacts`);
      await p.locator("#contact-search").waitFor();
      await p.locator(".directory-heading .item-actions-trigger").click();
      await p.getByRole("menuitem", { name: "Contacten exporteren" }).click();
      await p.locator("#export-kind").waitFor();
      assert.equal(await p.locator("#export-kind").inputValue(), "contacts");
      await p.goto(
        origin + `/workspace/${f.org}/insights?from=2020-03-30&to=2020-03-31`,
      );
      await p.locator(".section-action-group .item-actions-trigger").click();
      await capture(p, "exports-insights-entry-390");
      await p.getByRole("menuitem", { name: "Gegevens exporteren" }).click();
      await p.locator("#export-kind").waitFor();
      assert.equal(await p.locator("#export-from").inputValue(), "2020-03-30");
      assert.equal(
        await p.locator("#export-kind").inputValue(),
        "insights-summary",
      );
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("report.json", artifacts),
    JSON.stringify({ captures, errors }, null, 2),
  );
  console.log(
    `${captures.length} export visual states passed; actual local CSV download, private limits/recovery and contextual entry verified.`,
  );
} finally {
  await browser.close();
  await f.db.close();
}
