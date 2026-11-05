import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { learningInsightsFixture } from "../tests/learning-insights-fixture.ts";
import { learningApi } from "../src/server/learning-api.ts";
const origin = "http://localhost:3101";
await fetch(origin); // Require a local production preview; never target a hosted app.
const update = process.env.HIMMAH_UPDATE_DESIGN === "1";
const artifacts = new URL("../.artifacts/design/", import.meta.url),
  baselines = new URL("../tests/design-baselines/", import.meta.url);
await mkdir(artifacts, { recursive: true });
await mkdir(baselines, { recursive: true });
const f = await learningInsightsFixture(),
  org = f.org,
  activity = "22222222-2222-4222-8222-222222222222",
  sessionId = "33333333-3333-4333-8333-333333333333";
const organization = {
  id: org,
  name: "Selam · Synthetic Community",
  slug: "report-org",
  timezone: "Europe/Brussels",
  role: "owner",
  createdAt: "2026-11-01T10:00:00Z",
};
const activityItem = {
  id: activity,
  name: "Samen leren",
  description: "Een wekelijkse bijeenkomst om samen te leren.",
  location: "Grote zaal",
  timezone: organization.timezone,
  version: 1,
  cancelled: false,
  createdAt: organization.createdAt,
  audienceGroupIds: [],
  groups: [],
  nextSession: null,
  priceMinor: 1000,
};
const session = {
  ...activityItem,
  id: sessionId,
  activityId: activity,
  topic: "Samen leren en ontmoeten",
  startsAt: "2026-11-01T18:00:00Z",
  endsAt: "2026-11-01T19:00:00Z",
  registrationMode: "optional",
  registrationLimit: null,
  registrationCount: 2,
  registrationLocked: true,
  registration: {
    mode: "optional",
    confirmed: 2,
    capacity: null,
    remaining: null,
  },
  cancellationReason: "",
  canAttend: true,
  canCollect: true,
};
const contacts = [
  "Ayşe İrem van den Berg",
  "Mehmet Abdullah de Vries",
  "Lina Yılmaz",
].map((name, i) => ({
  id: `44444444-4444-4444-8444-44444444444${i}`,
  name,
  displayName: name,
  givenName: null,
  familyName: null,
  version: 1,
  archivedAt: null,
  createdAt: organization.createdAt,
  archived: false,
  eligible: true,
  status: "present",
}));
const groupId = "55555555-5555-4555-8555-555555555555";
const peopleGroup = {
  id: groupId,
  name: "Studiegroep",
  version: 1,
  memberCount: 3,
  description: "",
  archivedAt: null,
  createdAt: organization.createdAt,
};
const summary = {
  total: 3,
  present: 3,
  paid: 1,
  unpaid: 1,
  partial: 1,
  paymentCount: 3,
  expectedMinor: 3000,
  paidMinor: 1500,
  outstandingMinor: 1500,
  canEdit: true,
  cancelled: false,
  startsAt: session.startsAt,
};
const browser = await chromium.launch({
  executablePath: process.env.HIMMAH_CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [],
  results = [];
const captures = [];
async function capture(p, name) {
  const shot = await p.screenshot({ animations: "disabled" });
  await writeFile(new URL(name + ".png", artifacts), shot);
  if (update) await writeFile(new URL(name + ".png", baselines), shot);
  else {
    const expected = await readFile(new URL(name + ".png", baselines));
    const a = await sharp(shot)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      b = await sharp(expected)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    assert.deepEqual(a.info, b.info, name + " dimensions");
    let changed = 0;
    const diff = Buffer.alloc(a.data.length);
    for (let i = 0; i < a.data.length; i += 4) {
      const d = Math.max(
        ...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c])),
      );
      if (d > 35) changed++;
      diff[i] = d > 35 ? 255 : a.data[i] * 0.3;
      diff[i + 1] = d > 35 ? 0 : a.data[i + 1] * 0.3;
      diff[i + 2] = d > 35 ? 0 : a.data[i + 2] * 0.3;
      diff[i + 3] = 255;
    }
    await sharp(diff, { raw: a.info })
      .png()
      .toFile(new URL(name + "-diff.png", artifacts).pathname);
    assert.ok(
      changed / (a.info.width * a.info.height) < 0.005,
      name + " visual drift " + changed + " pixels",
    );
  }
  captures.push(name);
}
async function assertSearchFields(p) {
  const fields = await p.locator('input[type="search"]').evaluateAll((inputs) =>
    inputs
      .filter((e) => e.getBoundingClientRect().height > 0)
      .map((input) => {
        const style = getComputedStyle(input),
          root = getComputedStyle(document.documentElement),
          icon = input.closest(".search-field")?.querySelector("svg"),
          a = input.getBoundingClientRect(),
          b = icon?.getBoundingClientRect();
        const probe = document.createElement("span");
        probe.style.backgroundColor = root.getPropertyValue("--muted").trim();
        document.body.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          shared: !!input.closest(".search-field"),
          height: a.height,
          padding: style.paddingInlineStart,
          background: style.backgroundColor,
          expected,
          center: b
            ? Math.abs(b.y + b.height / 2 - (a.y + a.height / 2))
            : null,
        };
      }),
  );
  for (const field of fields) {
    assert.equal(field.shared, true, "Every search uses SearchField");
    assert.ok(field.height >= 48, "Search touch target");
    assert.equal(field.padding, "44px", "Inset search icon spacing");
    assert.equal(field.background, field.expected, "Warm quiet search surface");
    assert.ok(
      field.center !== null && field.center <= 1,
      "Search icon aligned",
    );
  }
}
try {
  for (const [width, locale] of [
    [390, "nl"],
    [320, "nl"],
    [320, "en"],
    [320, "tr"],
    [768, "nl"],
    [1280, "nl"],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
      timezoneId: "Europe/Brussels",
    });
    await ctx.addCookies([
      { name: "himmah_locale", value: locale, url: "http://localhost:3101" },
    ]);
    await ctx.addInitScript(() => {
      const RealDate = Date;
      globalThis.Date = class extends RealDate {
        constructor(...args) {
          super(...(args.length ? args : ["2026-11-02T10:00:00Z"]));
        }
        static now() {
          return new RealDate("2026-11-02T10:00:00Z").getTime();
        }
      };
    });
    const p = await ctx.newPage();
    let contactState = "normal";
    let follow = {
      following: true,
      reminderMinutes: 60,
      version: 0,
      source: "activity",
      canFollow: true,
    };
    const followWrites = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (route) => {
      const u = new URL(route.request().url());
      let response;
      if (
        u.pathname.endsWith("/follow") &&
        route.request().method() === "POST"
      ) {
        const body = route.request().postDataJSON();
        followWrites.push(body);
        follow = {
          ...follow,
          ...body,
          version: follow.version + 1,
          source: "own",
        };
        response = Response.json(follow);
      } else if (route.request().method() !== "GET") {
        assert.ok(
          u.pathname.endsWith("/contacts"),
          "Only mocked contact-save is permitted",
        );
        await new Promise((r) => setTimeout(r, 700));
        response = Response.json({ error: "service" }, { status: 503 });
      } else if (contactState === "error" && u.pathname.endsWith("/contacts"))
        response = Response.json({ error: "service" }, { status: 503 });
      else if (u.pathname === "/api/account")
        response = Response.json({
          user: {
            id: "owner",
            email: "owner@example.test",
            name: "Synthetic Owner",
            emailVerified: true,
          },
        });
      else if (u.pathname === "/api/organizations")
        response = Response.json({
          organizations: [organization],
          nextCursor: null,
        });
      else if (u.pathname === "/api/organizations/" + org)
        response = Response.json({ organization });
      else if (u.pathname.endsWith("/follow")) response = Response.json(follow);
      else if (u.pathname.endsWith("/notifications/unread"))
        response = Response.json({ count: 0 });
      else if (u.pathname.includes("/learning/contacts/"))
        response = Response.json({ items: [], total: 0, nextCursor: null });
      else if (u.pathname.endsWith("/contacts/" + contacts[0].id))
        response = Response.json(contacts[0]);
      else if (u.pathname.endsWith("/groups/" + groupId))
        response = Response.json(peopleGroup);
      else if (u.pathname.endsWith("/group-options"))
        response = Response.json({
          items: [{ ...peopleGroup, assigned: true }],
          nextCursor: null,
        });
      else if (u.pathname.endsWith("/groups/" + groupId + "/members"))
        response = Response.json({
          items: contacts.map((c) => ({
            ...c,
            contactId: c.id,
            validFrom: "2026-11-01",
            validTo: null,
            contactArchived: false,
          })),
          nextCursor: null,
        });
      else if (u.pathname.includes("/learning"))
        response = await learningApi(
          new Request("https://himmah.test" + u.pathname + u.search),
          { id: "owner", emailVerified: true },
          f.organizations,
          f.store,
        );
      else if (u.pathname.endsWith("/dashboard"))
        response = Response.json({
          items: [
            session,
            {
              ...session,
              id: crypto.randomUUID(),
              topic: "Creatieve workshop",
              startsAt: "2026-11-03T18:00Z",
              endsAt: "2026-11-03T19:00Z",
            },
            {
              ...session,
              id: crypto.randomUUID(),
              topic: "Samen sporten",
              startsAt: "2026-11-04T18:00Z",
              endsAt: "2026-11-04T19:00Z",
            },
          ],
          generatedAt: new Date().toISOString(),
        });
      else if (u.pathname.endsWith("/insights"))
        response = Response.json({
          summary: {
            sessions: 3,
            visits: 18,
            unique: 12,
            outstandingMinor: 1500,
            previous: {
              sessions: 2,
              visits: 14,
              unique: 10,
              outstandingMinor: 1000,
            },
            comparisonKind: "month",
            previousFrom: "2026-10-01",
            previousTo: "2026-10-02",
          },
          generatedAt: new Date().toISOString(),
        });
      else if (u.pathname.endsWith("/context"))
        response = Response.json({ id: org, name: organization.name });
      else if (u.pathname.endsWith("/contacts")) {
        if (contactState === "loading")
          await new Promise((r) => setTimeout(r, 1600));
        response = Response.json({
          items:
            contactState === "empty"
              ? []
              : contactState === "long"
                ? Array.from({ length: 25 }, (_, i) => ({
                    ...contacts[i % 3],
                    id: `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`,
                    displayName: `${String(i + 1).padStart(2, "0")} · ${contacts[i % 3].displayName}`,
                  }))
                : contacts,
          nextCursor: null,
        });
      } else if (u.pathname.endsWith("/attendance"))
        response = Response.json({
          items: contacts.map((c, i) => ({
            ...c,
            billing: {
              ...c,
              contactId: c.id,
              canCollect: true,
              status: ["paid", "unpaid", "partial"][i],
              priceMinor: 1000,
              chargedMinor: 1000,
              paidMinor: [1000, 0, 500][i],
              outstandingMinor: [0, 1000, 500][i],
              chargeVersion: 1,
              registrationRequired: false,
              reviewRequired: false,
            },
          })),
          nextCursor: null,
          summary,
        });
      else if (u.pathname.endsWith("/sessions/" + sessionId))
        response = Response.json({ item: session });
      else if (u.pathname.endsWith("/activities/" + activity))
        response = Response.json({ item: activityItem });
      else response = Response.json({ items: [], nextCursor: null });
      if (!response) throw Error("unhandled " + u.pathname);
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: JSON.stringify(await response.json(), (key, value) =>
          ["generatedAt", "publishedAt", "createdAt", "updatedAt"].includes(
            key,
          ) && typeof value === "string"
            ? "2026-11-01T10:00:00Z"
            : value,
        ),
      });
    });
    const pages = [
      ["home", `/workspace/${org}/dashboard`, "Start"],
      ["contacts", `/workspace/${org}/people/contacts`, "Contacten"],
      [
        "session",
        `/workspace/${org}/activities/${activity}/sessions/${sessionId}`,
        "Samen leren en ontmoeten",
      ],
      [
        "attendance",
        `/workspace/${org}/activities/${activity}/sessions/${sessionId}/attendance`,
        "Aanwezigheid en betalingen",
      ],
      ["learning", `/workspace/${org}/learning/${f.item}`, "New draft"],
      [
        "results",
        `/workspace/${org}/learning/${f.item}?publication=${f.publication}&tab=results`,
        "New draft",
      ],
      [
        "wizard",
        `/workspace/${org}/learning/${f.item}/edit`,
        "Leeritem bewerken",
      ],
    ];
    for (const [name, path] of pages) {
      await p.goto("http://localhost:3101" + path);
      await p.locator("main h1").waitFor();
      await p.waitForTimeout(400);
      const metrics = await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        headings: [...document.querySelectorAll("main h1,main h2,main h3")].map(
          (e) => ({
            text: e.textContent,
            top: Math.round(e.getBoundingClientRect().top),
            size: getComputedStyle(e).fontSize,
            weight: getComputedStyle(e).fontWeight,
          }),
        ),
        firstInput: [
          ...document.querySelectorAll("main input,main textarea"),
        ].map((e) => ({
          label: e.getAttribute("aria-label") || e.id,
          top: Math.round(e.getBoundingClientRect().top),
        })),
        mainHeight: document.querySelector("main")?.scrollHeight,
        buttons: [...document.querySelectorAll('main [data-slot="button"]')]
          .filter((e) => e.getBoundingClientRect().height > 0)
          .map((e) => ({
            text: e.textContent,
            top: Math.round(e.getBoundingClientRect().top),
            height: Math.round(e.getBoundingClientRect().height),
            variant: e.getAttribute("data-variant"),
          })),
      }));
      assert.equal(
        metrics.overflow,
        false,
        `${name}/${width}/${locale}: horizontal overflow`,
      );
      const clippedNavigation = await p
        .locator(".workspace-navigation span")
        .evaluateAll((es) =>
          es
            .filter(
              (e) =>
                e.getBoundingClientRect().width > 0 &&
                e.scrollWidth > e.clientWidth + 1,
            )
            .map((e) => e.textContent),
        );
      assert.deepEqual(clippedNavigation, [], "Readable navigation labels");
      await assertSearchFields(p);
      results.push({ name, width, locale, ...metrics });
      await capture(p, `${name}-${width}-${locale}`);
      if (name === "contacts" && width === 390 && locale === "nl") {
        await p.locator(".directory-heading .item-actions-trigger").click();
        await p
          .getByRole("menuitem", { name: "Contacten importeren" })
          .waitFor();
        await capture(p, "contacts-import-menu-390");
        await p.getByRole("menuitem", { name: "Contacten importeren" }).click();
        await p.locator("#import-file").waitFor();
        assert.equal(
          await p.locator("input:focus").count(),
          0,
          "Import opens without autofocus",
        );
        await p.locator(".form-page .settings-back").click();
        await p.locator("#contact-search").waitFor();
      }

      if (name === "session") {
        await p.locator(".follow-control button").click();
        const sheet = p.getByRole("dialog");
        await sheet.waitFor();
        await p.waitForTimeout(250);
        assert.equal(
          await sheet.locator("input:focus,select:focus").count(),
          0,
          "No autofocus",
        );
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          "Follow sheet has no horizontal overflow",
        );
        await capture(p, `follow-sheet-${width}-${locale}`);
        await sheet.getByRole("combobox").selectOption("0");
        await sheet.locator('button[type="submit"]').click();
        await sheet.waitFor({ state: "hidden" });
        assert.equal(followWrites.length, 1);
        assert.equal(followWrites[0].reminderMinutes, 0);
        assert.equal(followWrites[0].version, 0);
      }

      if (locale === "nl" && width <= 390) {
        if (name === "session") {
          const action = p.locator(".session-actions-primary");
          const box = await action.boundingBox();
          assert.ok(
            box.y + box.height < 772,
            "Session action reachable before supporting detail",
          );
        }
        if (name === "attendance") {
          const row = await p
            .locator(".attendance-row-heading")
            .first()
            .boundingBox();
          assert.ok(row.y < 720, "Working roster precedes long context");
        }
        if (name === "learning" || name === "results") {
          const tabs = await p.getByRole("tablist").boundingBox(),
            panel = await p.getByRole("tabpanel").boundingBox();
          assert.ok(
            tabs.y + tabs.height <= panel.y + 1,
            "Tabs must not cover panel",
          );
        }
      }
      if (name === "attendance" && width <= 390 && locale === "nl") {
        await p
          .getByRole("button", {
            name: "Acties voor Aanwezigheid en betalingen",
            exact: true,
          })
          .click();
        await p
          .getByRole("menuitem", { name: "Deelnemer toevoegen", exact: true })
          .click();
        const picker = p.getByRole("dialog");
        await picker.waitFor();
        assert.equal(
          await picker.locator("input:focus").count(),
          0,
          "Picker does not autofocus search",
        );
        await assertSearchFields(p);
        await capture(p, `attendance-picker-${width}`);
        await p.keyboard.press("Escape");
        await picker.waitFor({ state: "detached" });
      }
      if (name === "learning" && width <= 390 && locale === "nl") {
        const trigger = p.locator('main button[aria-haspopup="menu"]').first();
        await trigger.click();
        await capture(p, `menu-${width}`);
        await p.keyboard.press("Escape");
        await p.waitForTimeout(100);
        assert.equal(
          await trigger.evaluate((e) => document.activeElement === e),
          true,
          "Menu focus restoration",
        );
      }
      if (name === "contacts" && width <= 390 && locale === "nl") {
        const add = p.locator("main .directory-heading button").first();
        await add.click();
        const dialog = p.getByRole("dialog");
        await dialog.waitFor();
        assert.equal(await p.locator("input:focus").count(), 0, "No autofocus");
        await capture(p, `sheet-${width}`);
        const input = dialog.locator("input").first();
        await dialog.locator('button[type="submit"]').click();
        await dialog.getByRole("alert").waitFor();
        await capture(p, `invalid-${width}`);
        assert.equal(
          await input.getAttribute("aria-invalid"),
          "true",
          "Inline native required error",
        );
        const errorId = await input.getAttribute("aria-errormessage");
        assert.ok(errorId);
        assert.equal(
          await p.locator(`[id="${errorId}"]`).count(),
          1,
          "Field/error association",
        );
        const fields = await dialog.locator("fieldset").boundingBox(),
          footer = await dialog.locator("form > div").last().boundingBox();
        assert.ok(
          footer.y - fields.y - fields.height >= 15,
          "Form footer spacing after validation",
        );
        await input.fill("Synthetic new contact");
        const save = dialog.locator('button[type="submit"]');
        const before = await save.boundingBox();
        await save.click();
        await p.locator('button[aria-busy="true"]').waitFor();
        const pending = await save.boundingBox();
        assert.deepEqual(pending, before, "Pending geometry");
        assert.equal(await input.isDisabled(), true, "Pending draft locks");
        await capture(p, `pending-${width}`);
        await dialog.getByRole("alert").waitFor();
        assert.equal(await input.inputValue(), "Synthetic new contact");
        await capture(p, `failure-${width}`);
        await dialog
          .getByRole("button", { name: "Annuleren", exact: true })
          .click();
        await p.getByRole("alertdialog").waitFor();
        await capture(p, `discard-${width}`);
        await p
          .getByRole("alertdialog")
          .getByRole("button", { name: "Wijzigingen verwerpen", exact: true })
          .click();
        await dialog.waitFor({ state: "detached" });
        await p.waitForTimeout(350);
        assert.equal(
          await add.evaluate((e) => document.activeElement === e),
          true,
          "Restore focus",
        );
        await p.getByRole("button", { name: "Filters", exact: true }).click();
        await p.getByRole("checkbox").check();
        await capture(p, `filters-${width}`);
        await p
          .getByRole("dialog")
          .locator(".directory-actions button")
          .last()
          .click();
      }
    }
    if (width <= 390 && locale === "nl") {
      const person = contacts[0].id;
      const peopleScreens = [
        ["relationship-create", `forms/relationship/${person}`],
        ["communication-create", `forms/communication/${person}`],
        ["group-members", `people/groups/${groupId}`],
        ...["methods", "groups", "relationships", "communication"].map(
          (view) => [`contact-${view}`, `people/contacts/${person}/${view}`],
        ),
        ["relationship-types", "manage/relationship-types"],
      ];
      for (const [name, route] of peopleScreens) {
        await p.goto(`${origin}/workspace/${org}/${route}`);
        await p.locator("main h1").waitFor();
        await p.locator('input[type="search"]').first().waitFor();
        await p.waitForTimeout(300);
        await assertSearchFields(p);
        const gaps = await p.locator(".search-field").evaluateAll((es) =>
          es
            .map((e) => {
              const next = e.nextElementSibling;
              return next && next.getBoundingClientRect().height > 0
                ? next.getBoundingClientRect().top -
                    e.getBoundingClientRect().bottom
                : null;
            })
            .filter((g) => g !== null),
        );
        assert.ok(
          gaps.every((g) => g >= 8),
          "People search keeps space before results/filters",
        );
        assert.equal(
          await p.locator("input:focus").count(),
          0,
          "People search has no autofocus",
        );
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          "People search overflow",
        );
        await capture(p, `${name}-${width}`);
      }
      await p.goto(`${origin}/workspace/${org}/people/contacts/${person}`);
      await p
        .getByRole("button", { name: "Aan groep toevoegen", exact: true })
        .click();
      const sheet = p.getByRole("dialog");
      await sheet.waitFor();
      await assertSearchFields(p);
      assert.equal(
        await sheet.locator("input:focus").count(),
        0,
        "Group picker has no autofocus",
      );
      await capture(p, `contact-group-picker-${width}`);
      await p.keyboard.press("Escape");
      await sheet.waitFor({ state: "detached" });
    }
    if (width <= 390 && locale === "nl") {
      await p.goto(`${origin}/workspace/${org}/forms/activity/${activity}`);
      await p.locator("#activity-audience").waitFor();
      await p.locator("#activity-audience").selectOption("groups");
      await p.locator(".search-field input").waitFor();
      await p.locator(".search-field").scrollIntoViewIfNeeded();
      await assertSearchFields(p);
      await capture(p, `activity-picker-${width}`);
      await p.locator("#activity-audience").selectOption("everyone");
    }
    if (width === 390 && locale === "nl") {
      for (const state of ["empty", "long", "error", "loading"]) {
        contactState = state;
        await p.goto(`${origin}/workspace/${org}/people/contacts`);
        await p.locator("main h1").waitFor();
        if (state === "loading") await p.getByRole("status").first().waitFor();
        else if (state === "error") await p.getByRole("alert").waitFor();
        else await p.waitForTimeout(250);
        await capture(p, `contacts-${state}`);
        if (state === "long") {
          assert.equal(
            await p.locator("main .directory-list > li").count(),
            25,
          );
          await p
            .locator("main .directory-list > li")
            .last()
            .scrollIntoViewIfNeeded();
          await capture(p, "contacts-long-end");
        }
      }
      contactState = "normal";
      await p.goto(
        `${origin}/workspace/${org}/learning/${f.item}?publication=${f.publication}&tab=results`,
      );
      await p.locator(".learning-insights-heading").waitFor();
      await p.evaluate(() => (document.body.style.zoom = "1.25"));
      await p.waitForTimeout(200);
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Enlarged text overflow",
      );
      await capture(p, "results-enlarged");
    }
    await ctx.close();
  }
  assert.deepEqual(errors, [], "No page exceptions");
  await writeFile(
    new URL("measurements.json", artifacts),
    JSON.stringify({ captures, errors, results }, null, 2),
  );
  console.log(
    `${captures.length} visual states passed; ${results.length} page layouts, no horizontal overflow or page exceptions.`,
  );
} finally {
  await browser.close();
  await f.db.close();
}
