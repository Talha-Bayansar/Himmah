import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, type Env } from "../src/server/worker.ts";
import {
  organizationSlug,
  validateOrganization,
  type Organization,
} from "../src/organization/contracts.ts";
import type { OrganizationStore } from "../src/server/store.ts";
const app = "https://himmah-hub.talha-bayansar.workers.dev";
const key = "b1111111-1111-4111-8111-111111111111";
const input = {
  name: "Noor Youth",
  slug: "noor-youth",
  timezone: "Europe/Amsterdam",
  creationKey: key,
};
function harness() {
  let user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
  } | null = {
    id: "owner-a",
    name: "Organizer A",
    email: "a@example.invalid",
    emailVerified: true,
  };
  const calls: { url: string; init?: RequestInit }[] = [];
  const records = new Map<
    string,
    { owner: string; key: string; org: Organization }
  >();
  let rateAllowed = true;
  const store: OrganizationStore = {
    async list(id) {
      return [...records.values()]
        .filter((r) => r.owner === id)
        .map((r) => r.org);
    },
    async get(id, orgId) {
      const value = records.get(orgId);
      return value?.owner === id ? value.org : null;
    },
    async create(owner, v) {
      const replay = [...records.values()].find(
        (r) => r.owner === owner && r.key === v.creationKey,
      );
      if (replay) return replay.org;
      if ([...records.values()].some((r) => r.org.slug === v.slug))
        throw Object.assign(Error("duplicate"), { code: "23505" });
      const org: Organization = {
        id: crypto.randomUUID(),
        name: v.name,
        slug: v.slug,
        timezone: v.timezone,
        role: "owner",
        createdAt: "2026-10-18T12:00:00Z",
      };
      records.set(org.id, { owner, key: v.creationKey, org });
      return org;
    },
  };
  const env: Env = {
    ASSETS: { fetch: async () => new Response("static-demo") },
    HIMMAH_DATABASE_URL: "not-a-real-secret",
    HIMMAH_AUTH_URL: "https://auth.example.invalid/auth",
    HIMMAH_APP_ORIGIN: app,
    ONBOARDING_LIMITER: { limit: async () => ({ success: rateAllowed }) },
  };
  const handler = createHandler({
    store: () => store,
    fetch: async (url, init) => {
      calls.push({ url: String(url), ...(init ? { init } : {}) });
      if (String(url).includes("/get-session"))
        return Response.json(user ? { user } : null);
      return new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie":
            "session=opaque; Domain=auth.example.invalid; Path=/auth; Secure; HttpOnly; SameSite=Lax",
        },
      });
    },
  });
  const request = (
    path: string,
    options: { method?: string; body?: unknown; origin?: string } = {},
  ) =>
    new Request(app + path, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Origin: options.origin ?? app,
        Cookie: "session=opaque",
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  return {
    handler,
    env,
    request,
    calls,
    setUser: (value: typeof user) => {
      user = value;
    },
    setRate: (v: boolean) => {
      rateAllowed = v;
    },
  };
}
test("workspace validation rejects invalid or reserved slugs and bad timezones", () => {
  assert.equal(
    organizationSlug("Nûr Youth & Community"),
    "nur-youth-community",
  );
  assert.deepEqual(validateOrganization(input), input);
  for (const data of [
    { ...input, name: " " },
    { ...input, slug: "api" },
    { ...input, slug: "not valid" },
    { ...input, timezone: "bad-zone" },
    { ...input, creationKey: "oops" },
  ])
    assert.throws(() => validateOrganization(data));
});
test("unauthenticated organization requests are denied and never return demo records", async () => {
  const h = harness();
  h.setUser(null);
  const r = await h.handler(h.request("/api/organizations"), h.env);
  assert.equal(r.status, 401);
  assert.equal(r.headers.get("cache-control"), "no-store");
});
test("organization creation requires verified email", async () => {
  const h = harness();
  h.setUser({
    id: "unverified",
    name: "New owner",
    email: "u@example.invalid",
    emailVerified: false,
  });
  const r = await h.handler(
    h.request("/api/organizations", { method: "POST", body: input }),
    h.env,
  );
  assert.equal(r.status, 403);
});
test("cross-origin mutation and invalid input are rejected", async () => {
  const h = harness();
  assert.equal(
    (
      await h.handler(
        h.request("/api/organizations", {
          method: "POST",
          body: input,
          origin: "https://evil.invalid",
        }),
        h.env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await h.handler(
        h.request("/api/organizations", {
          method: "POST",
          body: { ...input, slug: "!" },
        }),
        h.env,
      )
    ).status,
    400,
  );
});
test("verified owner can create, restore and retry a workspace without duplicates", async () => {
  const h = harness();
  const a = await h.handler(
    h.request("/api/organizations", {
      method: "POST",
      body: { ...input, userId: "attacker", role: "admin" },
    }),
    h.env,
  );
  assert.equal(a.status, 201);
  const first = await a.json();
  const b = await h.handler(
    h.request("/api/organizations", { method: "POST", body: input }),
    h.env,
  );
  assert.equal(b.status, 201);
  assert.equal((await b.json()).organization.id, first.organization.id);
  const list = await h.handler(h.request("/api/organizations"), h.env);
  const all = await list.json();
  assert.equal(all.organizations.length, 1);
  assert.equal(all.organizations[0].role, "owner");
  const detail = await h.handler(
    h.request("/api/organizations/" + first.organization.id),
    h.env,
  );
  assert.equal(detail.status, 200);
});
test("another signed-in organization owner cannot list or guess the first organization", async () => {
  const h = harness();
  const created = await h.handler(
    h.request("/api/organizations", { method: "POST", body: input }),
    h.env,
  );
  const { organization } = await created.json();
  h.setUser({
    id: "owner-b",
    name: "Organizer B",
    email: "b@example.invalid",
    emailVerified: true,
  });
  assert.deepEqual(
    (await (await h.handler(h.request("/api/organizations"), h.env)).json())
      .organizations,
    [],
  );
  assert.equal(
    (await h.handler(h.request("/api/organizations/" + organization.id), h.env))
      .status,
    404,
  );
  const duplicate = await h.handler(
    h.request("/api/organizations", {
      method: "POST",
      body: { ...input, creationKey: "c1111111-1111-4111-8111-111111111111" },
    }),
    h.env,
  );
  assert.equal(duplicate.status, 409);
});
test("auth proxy only forwards pinned endpoints and scopes cookies to the app", async () => {
  const h = harness();
  const r = await h.handler(
    h.request("/api/auth/sign-in/email", {
      method: "POST",
      body: { email: "a@example.invalid", password: "fictional-test-password" },
    }),
    h.env,
  );
  assert.equal(r.status, 200);
  assert.equal(
    h.calls[0]?.url,
    "https://auth.example.invalid/auth/sign-in/email",
  );
  assert.equal(new Headers(h.calls[0]?.init?.headers).get("origin"), app);
  assert.ok(r.headers.get("set-cookie")?.includes("Path=/;"));
  assert.ok(!r.headers.get("set-cookie")?.includes("Domain="));
  assert.equal(
    (await h.handler(h.request("/api/auth/admin/list-users"), h.env)).status,
    404,
  );
  assert.equal(
    (await h.handler(h.request("/api/auth/sign-out"), h.env)).status,
    405,
  );
});
test("rate-limited auth and workspace mutations return a useful error", async () => {
  const h = harness();
  h.setRate(false);
  assert.equal(
    (
      await h.handler(
        h.request("/api/organizations", { method: "POST", body: input }),
        h.env,
      )
    ).status,
    429,
  );
  assert.equal(
    (
      await h.handler(
        h.request("/api/auth/sign-in/email", { method: "POST", body: {} }),
        h.env,
      )
    ).status,
    429,
  );
});
test("non-API requests preserve the demo and assets; session responses are never cached", async () => {
  const h = harness();
  assert.equal(
    await (await h.handler(h.request("/"), h.env)).text(),
    "static-demo",
  );
  const r = await h.handler(h.request("/api/account"), h.env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.ok(h.calls[0]?.url.includes("disableCookieCache=true"));
});
test("upstream failures do not leak infrastructure errors or credentials", async () => {
  const h = harness();
  const handler = createHandler({
    store: () => {
      throw Error("private connection string");
    },
    fetch: async () =>
      Response.json({ user: { id: "a", emailVerified: true } }),
  });
  const r = await handler(h.request("/api/organizations"), h.env);
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes("connection string"));
});

test("requests without a session cookie are rejected without an auth network call", async () => {
  const h = harness();
  const response = await h.handler(new Request(app + "/api/account"), h.env);
  assert.equal(response.status, 401);
  assert.equal(h.calls.length, 0);
});
