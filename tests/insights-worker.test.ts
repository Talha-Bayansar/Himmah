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

test("Dashboard Worker dispatch authenticates and rate limits even read-only scoped previews", async () => {
  const origin = "https://himmah.example",
    org = "11111111-1111-4111-8111-111111111111";
  let allowed = true,
    verified = true,
    calls = 0;
  const handler = createHandler({
    store: () =>
      ({
        get: async () => ({ id: org, role: "volunteer", timezone: "UTC" }),
      }) as unknown as OrganizationStore,
    dashboard: () => ({
      sessions: async () => {
        calls++;
        return [];
      },
      get: async () => {
        calls++;
        return [{ items: [], generatedAt: new Date().toISOString() }];
      },
    }),
    fetch: async () =>
      Response.json({ user: { id: "helper", emailVerified: verified } }),
  });
  const env: Env = {
    ASSETS: { fetch: async () => new Response("static") },
    HIMMAH_DATABASE_URL: "isolated-test",
    HIMMAH_AUTH_URL: "https://auth.example.invalid/auth",
    HIMMAH_APP_ORIGIN: origin,
    ONBOARDING_LIMITER: { limit: async () => ({ success: allowed }) },
  };
  const request = (cookie = true) =>
    new Request(`${origin}/api/organizations/${org}/dashboard`, {
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: "session=opaque" } : {}),
      },
    });
  assert.equal((await handler(request(false), env)).status, 401);
  assert.equal(calls, 0);
  assert.equal((await handler(request(), env)).status, 200);
  assert.equal(calls, 1);
  allowed = false;
  assert.equal((await handler(request(), env)).status, 429);
  assert.equal(calls, 1);
  allowed = true;
  verified = false;
  assert.equal((await handler(request(), env)).status, 403);
  assert.equal(calls, 1);
  verified = true;
  const sessionsRequest = () =>
    new Request(`${origin}/api/organizations/${org}/sessions`, {
      headers: { Origin: origin, Cookie: "session=opaque" },
    });
  const planned = await handler(sessionsRequest(), env);
  assert.equal(planned.status, 200);
  assert.deepEqual(await planned.json(), { items: [], nextCursor: null });
  assert.equal(calls, 2);
  allowed = false;
  assert.equal((await handler(sessionsRequest(), env)).status, 429);
  assert.equal(calls, 2);
});
