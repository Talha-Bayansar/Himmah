import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

// Production assets on the project port, synthetic account and fully mocked device APIs only.
const origin = "http://localhost:3101";
await fetch(origin);
const artifacts = new URL("../.artifacts/preferences/", import.meta.url),
  baselines = new URL("../tests/design-baselines/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const update = process.env.HIMMAH_UPDATE_DESIGN === "1",
  captures = [],
  errors = [];
async function capture(page, name) {
  const png = await page.screenshot({ animations: "disabled" });
  await writeFile(new URL(name + ".png", artifacts), png);
  if (update) await writeFile(new URL(name + ".png", baselines), png);
  else {
    const expected = await readFile(new URL(name + ".png", baselines));
    const a = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      b = await sharp(expected)
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
      name + " visual drift " + changed + " pixels",
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
  for (const [width, locale] of [
    [390, "nl"],
    [320, "nl"],
    [320, "en"],
    [320, "tr"],
    [768, "nl"],
    [1280, "nl"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
      timezoneId: "Europe/Brussels",
    });
    await context.addCookies([
      { name: "himmah_locale", value: locale, url: origin },
    ]);
    let mode = "off",
      deletes = 0;
    await context.addInitScript(() => {
      const state = localStorage.getItem("preferences-fixture") ?? "off";
      window.__preferencesPermissionRequests = 0;
      Object.defineProperty(navigator, "standalone", {
        configurable: true,
        value: state !== "ios",
      });
      if (state === "ios")
        Object.defineProperty(navigator, "userAgent", {
          configurable: true,
          value: "iPhone",
        });
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: class {
          static get permission() {
            return state === "denied"
              ? "denied"
              : state === "enabled"
                ? "granted"
                : "default";
          }
          static requestPermission() {
            window.__preferencesPermissionRequests++;
            throw Error(
              "No native notification prompts are allowed in visual tests",
            );
          }
        },
      });
      Object.defineProperty(window, "PushManager", {
        configurable: true,
        value: class {},
      });
      if (state === "unsupported") delete window.PushManager;
      const subscription = {
        endpoint: "https://push.example.test/synthetic",
        toJSON: () => ({
          endpoint: "https://push.example.test/synthetic",
          keys: {},
        }),
        unsubscribe: async () => {
          throw Error("Visual checks must not unsubscribe");
        },
      };
      const registration = {
        pushManager: {
          getSubscription: async () =>
            state === "enabled" ? subscription : null,
        },
        getNotifications: async () => [],
      };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          getRegistration: async () => registration,
          register: async () => registration,
          ready: Promise.resolve(registration),
        },
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      let response;
      if (request.method() === "DELETE") {
        deletes++;
        throw Error("Visual checks must not revoke devices or sign out");
      }
      if (path === "/api/account")
        response = Response.json({
          user: {
            id: "synthetic-owner",
            name: "Ayşe İrem van den Berg",
            email: "community.organizer@example.test",
            emailVerified: true,
          },
        });
      else if (path === "/api/organizations")
        response = Response.json({ organizations: [], nextCursor: null });
      else if (path === "/api/notifications/push/status") {
        assert.equal(request.method(), "POST");
        assert.equal(
          request.postDataJSON().endpoint,
          "https://push.example.test/synthetic",
        );
        response = Response.json({ enabled: mode === "enabled" });
      } else if (path === "/api/notifications/push") {
        if (request.method() === "POST") {
          assert.equal(mode, "enabled");
          assert.equal(
            request.postDataJSON().endpoint,
            "https://push.example.test/synthetic",
          );
          response = Response.json({ ok: true });
        } else {
          assert.equal(request.method(), "GET");
          if (mode === "loading")
            await new Promise((resolve) => setTimeout(resolve, 1600));
          response =
            mode === "error"
              ? Response.json({ code: "service" }, { status: 503 })
              : Response.json({
                  publicKey: mode === "unavailable" ? null : "BAAA",
                });
        }
      } else throw Error("Unexpected preferences fixture request " + path);
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    async function open(state = "off") {
      mode = state;
      if (page.url().startsWith(origin))
        await page.evaluate(
          (value) => localStorage.setItem("preferences-fixture", value),
          state,
        );
      await page.goto(origin + "/settings");
      await page.locator(".preferences-page").waitFor();
      if (state === "loading")
        await page.locator('.push-settings [data-slot="skeleton"]').waitFor();
      else if (state === "error")
        await page.locator('.push-settings [role="alert"]').waitFor();
      else {
        await page.locator(".push-settings > p").first().waitFor();
        await page.waitForTimeout(250);
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Preferences overflow",
      );
      assert.equal(
        await page.locator("input:focus,select:focus").count(),
        0,
        "No preferences autofocus",
      );
      assert.equal(
        await page.evaluate(() => window.__preferencesPermissionRequests),
        0,
        "Permission remains explicit",
      );
      const box = await page.locator(".preferences-page").boundingBox();
      assert.ok(box.width <= 680, "Reading column");
      const fits = await page
        .locator(".preferences-language select")
        .evaluate((select) => {
          const style = getComputedStyle(select),
            canvas = document.createElement("canvas"),
            ctx = canvas.getContext("2d");
          ctx.font = style.font;
          return (
            ctx.measureText(select.selectedOptions[0].text).width +
              parseFloat(style.paddingLeft) +
              parseFloat(style.paddingRight) <=
            select.clientWidth + 1
          );
        });
      assert.ok(fits, "Complete language name fits");
    }
    await open();
    await capture(page, `preferences-${width}-${locale}`);
    const action = await page.locator(".push-device-action").boundingBox();
    if (width <= 390)
      assert.ok(
        action.y + action.height < 844,
        "Current-device action reachable",
      );
    assert.equal(
      await page.locator(".preferences-help").evaluate((e) => e.open),
      false,
      "Secondary guidance starts collapsed",
    );
    if (width === 320) {
      await page.evaluate(() => (document.body.style.zoom = "1.25"));
      await page.waitForTimeout(100);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Preferences enlarged text overflow",
      );
      const overlap = await page
        .locator(".preferences-language")
        .evaluate((row) => {
          const label = row.firstElementChild.getBoundingClientRect(),
            control = row.querySelector("select").getBoundingClientRect();
          return label.bottom > control.y && label.right > control.x;
        });
      assert.equal(
        overlap,
        false,
        "Language label and control remain separate",
      );
      await capture(page, `preferences-${width}-${locale}-enlarged`);
      await page.evaluate(() => (document.body.style.zoom = ""));
    }
    if (width === 390 && locale === "nl") {
      await page.locator(".preferences-help summary").click();
      await capture(page, "preferences-help");
      await page.locator(".preferences-help summary").click();
      const trigger = page.locator(".push-settings .item-actions-trigger");
      await trigger.click();
      await page.getByRole("menu").waitFor();
      await capture(page, "preferences-menu");
      await page
        .getByRole("menuitem", {
          name: "Uitschakelen op alle apparaten",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      await capture(page, "preferences-confirmation");
      await dialog
        .getByRole("button", { name: "Annuleren", exact: true })
        .click();
      assert.equal(deletes, 0, "Cancelling preserves subscriptions");
      await page.locator(".preferences-language select").selectOption("tr");
      await page
        .getByRole("heading", { name: "Profiliniz", exact: true })
        .waitFor();
      await capture(page, "preferences-language-changed");
      await page.reload();
      await page
        .getByRole("heading", { name: "Profiliniz", exact: true })
        .waitFor();
      assert.equal(
        await page.locator(".preferences-language select").inputValue(),
        "tr",
        "Language persists on reload",
      );
      // Restore Dutch through the real preference control for state references.
      await page.locator(".preferences-language select").selectOption("nl");
      for (const state of [
        "enabled",
        "denied",
        "ios",
        "unsupported",
        "unavailable",
        "error",
        "loading",
      ]) {
        await open(state);
        await capture(page, "preferences-" + state);
        if (["denied", "unavailable"].includes(state))
          assert.equal(
            await page.locator(".push-device-action").isDisabled(),
            true,
            "Blocked enable stays disabled",
          );
        if (["ios", "unsupported"].includes(state))
          assert.equal(
            await page.locator(".push-device-action").count(),
            0,
            "Unsupported state has guidance instead of enable",
          );
        if (state === "error") {
          mode = "off";
          await page
            .getByRole("button", { name: "Opnieuw proberen", exact: true })
            .click();
          await page.locator(".push-device-action").waitFor();
          assert.equal(
            await page.locator('.push-settings [role="alert"]').count(),
            0,
            "Loading retry recovers",
          );
        }
        if (state === "loading")
          await page.locator(".push-device-action").waitFor();
      }
    }
    assert.equal(deletes, 0);
    await context.close();
  }
  assert.deepEqual(errors, [], "No preferences page errors");
  console.log(
    `${captures.length} preferences visual states passed; device scopes, language, permission gates and layout verified without native push writes.`,
  );
} finally {
  await browser.close();
}
