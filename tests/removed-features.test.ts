import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHandler, type Env } from "../src/server/worker.ts";
const org = "11111111-1111-4111-8111-111111111111";
test("removed API families and attendance earning preview return 404 for authenticated staff", async () => {
  const handler = createHandler({
    fetch: async () =>
      Response.json({
        user: {
          id: "owner",
          emailVerified: true,
          name: "Staff",
          email: "staff@example.test",
        },
      }),
    store: () => ({
      list: async () => {
        throw Error("Unexpected query");
      },
      get: async () => {
        throw Error("Unexpected query");
      },
      create: async () => {
        throw Error("Unexpected query");
      },
    }),
  });
  const env = {
    HIMMAH_DATABASE_URL: "https://fixture.invalid",
    HIMMAH_AUTH_URL: "https://auth.fixture.invalid",
    HIMMAH_APP_ORIGIN: "https://himmah.test",
    ONBOARDING_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  } as unknown as Env;
  for (const endpoint of [
    "futsal",
    "futsal/seasons",
    "points",
    "members",
    "rewards",
    "reward-wallet",
    "coupon-collection",
    "me/claims",
    "me/coupons",
    "me",
    "participants",
    "challenges",
    "me/challenges",
    "periods",
    "work/members",
    "people",
    "groups",
  ])
    for (const method of ["GET", "POST"]) {
      const response = await handler(
        new Request(
          `https://himmah.test/api/organizations/${org}/${endpoint}`,
          {
            method,
            headers: {
              cookie: "session=fixture",
              origin: "https://himmah.test",
              "content-type": "application/json",
            },
            ...(method === "POST" ? { body: "{}" } : {}),
          },
        ),
        env,
      );
      assert.equal(response.status, 404, method + " " + endpoint);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  const maintenance = await handler(
    new Request("https://himmah.test/api/account"),
    { ...env, HIMMAH_MAINTENANCE: "true" },
  );
  assert.equal(maintenance.status, 503);
});
test("the active schema, route registry, assets and package dependencies cannot recreate removed products", async () => {
  const schema = await readFile("src/server/schema.ts", "utf8");
  assert.ok(
    !/points|reward|coupon|challenge|futsal|participant|earning|engagement_period/i.test(
      schema,
    ),
  );
  const routes = await readdir("src/routes");
  assert.ok(
    !routes.some((f) =>
      /futsal|challenge|coupon|reward|period|participate/.test(f),
    ),
  );
  const pwa = await readdir("public/pwa");
  assert.ok(!pwa.includes("futsal"));
  assert.ok(!(await readdir("public")).includes("futsal"));
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.dependencies["@zxing/browser"], undefined);
  assert.equal(pkg.dependencies["qrcode.react"], undefined);
  const generator = await readFile("scripts/generate-pwa-assets.mjs", "utf8");
  assert.ok(!/futsal|arena|gameMark/.test(generator));
});
