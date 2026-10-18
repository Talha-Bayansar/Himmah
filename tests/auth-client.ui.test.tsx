import { authFailure } from "../src/localization/errors";
import { m } from "../src/paraglide/messages.js";
import { it, expect, vi } from "vitest";
import { authClient } from "../src/organization/auth";
import { createHandler, type Env } from "../src/server/worker";

it("runs real Neon signup and verification requests through the actual proxy contract", async () => {
  const requests: {
    path: string;
    headers: Headers;
    body: Record<string, string>;
  }[] = [];
  let rateAllowed = true;
  const app = window.location.origin;
  const env: Env = {
    HIMMAH_APP_ORIGIN: app,
    HIMMAH_AUTH_URL: "https://auth.example.invalid/auth",
    HIMMAH_DATABASE_URL: "test-only",
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    ONBOARDING_LIMITER: { limit: async () => ({ success: rateAllowed }) },
  };
  const handler = createHandler({
    store: () => {
      throw Error("No database operation expected");
    },
    fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const headers = request.headers;
      expect(headers.get("x-neon-auth-middleware")).toBe("true");
      expect(headers.get("x-neon-client-info")).toBeTruthy();
      expect(headers.get("origin")).toBe(app);
      requests.push({
        path: new URL(request.url).pathname,
        headers,
        body: (await request.json()) as Record<string, string>,
      });
      return Response.json({
        user: {
          id: "test-only",
          name: "Test Organizer",
          email: "organizer@example.invalid",
          emailVerified: false,
        },
        token: "test-token",
      });
    }) as typeof fetch,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const original = new Request(input, init);
      const headers = new Headers(original.headers);
      // Browsers attach Origin to same-origin POSTs; Node's fetch test double does not.
      headers.set("origin", app);
      return handler(new Request(original, { headers }), env);
    }),
  );
  const client = await authClient();
  const result = await client.signUp.email({
    name: "Test Organizer",
    email: "organizer@example.invalid",
    password: "test-only-password-123",
  });
  expect(result.error).toBeNull();
  await client.emailOtp.sendVerificationOtp({
    email: "organizer@example.invalid",
    type: "email-verification",
  });
  expect(requests[0]).toMatchObject({
    path: "/auth/sign-up/email",
    body: {
      email: "organizer@example.invalid",
      password: "test-only-password-123",
    },
  });
  expect(requests[1]?.path).toBe("/auth/email-otp/send-verification-otp");
  rateAllowed = false;
  const failure = await client.signUp
    .email({
      name: "Test Organizer",
      email: "other@example.invalid",
      password: "test-only-password-123",
    })
    .catch((error: unknown) => error);
  expect(failure).toMatchObject({
    status: 429,
    code: "over_request_rate_limit",
  });
  expect(authFailure(failure)).toBe(m.error_rate_limit());
  expect(requests).toHaveLength(2);
});
