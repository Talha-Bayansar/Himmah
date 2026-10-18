import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { m } from "../src/paraglide/messages.js";
import { getLocale } from "../src/paraglide/runtime.js";
import { paraglideMiddleware } from "../src/paraglide/server.js";
import { localizedText, authError } from "../src/localization/errors.ts";

test("English, Dutch and Turkish catalogs are complete and compiled", async () => {
  const catalogs = await Promise.all(
    ["en", "nl", "tr"].map(
      async (locale) =>
        JSON.parse(
          await readFile(
            new URL(`../messages/${locale}.json`, import.meta.url),
            "utf8",
          ),
        ) as Record<string, string>,
    ),
  );
  const keys = Object.keys(catalogs[0]!)
    .filter((key) => key !== "$schema")
    .sort();
  for (const [index, locale] of (["en", "nl", "tr"] as const).entries()) {
    assert.deepEqual(
      Object.keys(catalogs[index]!)
        .filter((key) => key !== "$schema")
        .sort(),
      keys,
    );
    for (const key of keys) {
      assert.ok(catalogs[index]![key]?.trim(), `${locale}.${key} is empty`);
      assert.equal(
        (
          m as unknown as Record<
            string,
            (inputs: {}, options: { locale: string }) => string
          >
        )[key]!(
          Object.fromEntries(
            [...catalogs[index]![key]!.matchAll(/\{(\w+)\}/g)].map((match) => [
              match[1],
              match[0],
            ]),
          ),
          { locale },
        ),
        catalogs[index]![key],
      );
    }
  }
});

test("SSR locale cookies stay isolated across simultaneous requests and invalid locales fall back", async () => {
  const requests = ["nl", "tr", "en", "not-supported", "tr", "nl"];
  const responses = await Promise.all(
    requests.map((locale) =>
      paraglideMiddleware(
        new Request("https://himmah.example/start", {
          headers: { cookie: `himmah_locale=${locale}` },
        }),
        async () => {
          await new Promise((resolve) =>
            setTimeout(resolve, locale === "nl" ? 8 : 1),
          );
          return new Response(
            JSON.stringify({ locale: getLocale(), title: m.signup_title() }),
          );
        },
      ),
    ),
  );
  for (const [index, response] of responses.entries()) {
    const locale =
      requests[index] === "not-supported" ? "en" : requests[index]!;
    assert.deepEqual(await response.json(), {
      locale,
      title: m.signup_title({}, { locale: locale as "en" | "nl" | "tr" }),
    });
    assert.match(response.headers.get("Vary") ?? "", /Cookie/i);
  }
});

test("known provider errors and validation messages translate without exposing unknown upstream text", () => {
  assert.equal(
    authError("INVALID_EMAIL_OR_PASSWORD", "fallback"),
    m.error_credentials(),
  );
  assert.equal(authError("OTP_EXPIRED", "fallback"), m.error_expired_code());
  assert.equal(
    localizedText("Organization name must be 2–100 characters."),
    m.error_name(),
  );
  assert.equal(
    localizedText("Database connection failed at internal-host.invalid"),
    m.error_generic(),
  );
});
