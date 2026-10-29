import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, type Env } from "../src/server/worker.ts";
import type { OrganizationStore } from "../src/server/store.ts";
import type { InsightsStore } from "../src/server/insights-store.ts";

test("Insights Worker route preserves authentication, verification, role checks and read rate limiting", async () => {
  const org = "11111111-1111-4111-8111-111111111111",
    origin = "https://himmah.example";
  let allowed = true,
    role = "owner",
    verified = true,
    calls = 0;
  const organizations = {
    get: async () => ({ id: org, role, timezone: "UTC" }),
    list: async () => [],
    create: async () => {
      throw Error("not used");
    },
  } as unknown as OrganizationStore;
  const insights: InsightsStore = {
    report: async () => {
      calls++;
      return [
        {
          timezone: "UTC",
          generatedAt: new Date().toISOString(),
          summary: { visits: 0 },
          trend: [],
          items: [],
        },
      ];
    },
    options: async () => [],
  };
  const env: Env = {
    ASSETS: { fetch: async () => new Response("static") },
    HIMMAH_DATABASE_URL: "isolated-test",
    HIMMAH_AUTH_URL: "https://auth.example.invalid/auth",
    HIMMAH_APP_ORIGIN: origin,
    ONBOARDING_LIMITER: { limit: async () => ({ success: allowed }) },
  };
  const handler = createHandler({
    store: () => organizations,
    insights: () => insights,
    fetch: async () =>
      Response.json({
        user: {
          id: "owner",
          name: "Owner",
          email: "owner@example.test",
          emailVerified: verified,
        },
      }),
  });
  const request = (cookie = true) =>
    new Request(
      `${origin}/api/organizations/${org}/insights?from=2020-01-01&to=2020-01-31`,
      {
        headers: {
          Origin: origin,
          ...(cookie ? { Cookie: "session=opaque" } : {}),
        },
      },
    );
  assert.equal((await handler(request(false), env)).status, 401);
  assert.equal(calls, 0);
  assert.equal((await handler(request(), env)).status, 200);
  assert.equal(calls, 1);
  allowed = false;
  assert.equal((await handler(request(), env)).status, 429);
  assert.equal(calls, 1);
  allowed = true;
  role = "volunteer";
  assert.equal((await handler(request(), env)).status, 403);
  assert.equal(calls, 1);
  role = "owner";
  verified = false;
  assert.equal((await handler(request(), env)).status, 403);
  assert.equal(calls, 1);
});
