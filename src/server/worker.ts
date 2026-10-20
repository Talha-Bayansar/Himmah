import { futsalApi } from "./futsal-api.ts";
import { createFutsalStore, type FutsalStore } from "./futsal-store.ts";
import { notificationApi } from "./notification-api.ts";
import {
  createNotificationStore,
  type NotificationStore,
} from "./notification-store.ts";
import { challengeApi } from "./challenge-api.ts";
import {
  createChallengeStore,
  type ChallengeStore,
} from "./challenge-store.ts";
import { couponApi } from "./coupon-api.ts";
import { createCouponStore, type CouponStore } from "./coupon-store.ts";
import { participantApi } from "./participant-api.ts";
import { createParticipantStore } from "./participant-store.ts";
import { rewardApi } from "./reward-api.ts";
import { createRewardStore } from "./reward-store.ts";
import { accessApi } from "./access-api.ts";
import { createAccessStore } from "./access-store.ts";
import { periodApi } from "./period-api.ts";
import { createPeriodStore } from "./period-store.ts";
import { pointsApi } from "./points-api.ts";
import { createPointsStore } from "./points-store.ts";
import { attendanceApi } from "./attendance-api.ts";
import { createAttendanceStore } from "./attendance-store.ts";
import { activityApi } from "./activity-api.ts";
import { createActivityStore } from "./activity-store.ts";
import { communityApi } from "./community-api.ts";
import {
  createCommunityStore,
  type CommunityStore,
} from "./community-store.ts";
import {
  pageInput,
  pageResult,
  CommunityError,
} from "../community/contracts.ts";
import { createStore, type OrganizationStore } from "./store.ts";
import {
  requireSameOrigin,
  validateOrganization,
} from "../organization/contracts.ts";
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  HIMMAH_DATABASE_URL: string;
  HIMMAH_VAPID_PUBLIC_KEY?: string;
  HIMMAH_VAPID_PRIVATE_KEY?: string;
  HIMMAH_AUTH_URL: string;
  HIMMAH_APP_ORIGIN: string;
  DIRECTORY_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  ONBOARDING_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
interface Identity {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}
type Dependencies = {
  fetch: typeof fetch;
  store: (url: string) => OrganizationStore;
  directory?: (url: string) => CommunityStore;
  challenges?: (url: string) => ChallengeStore;
  notifications?: (url: string) => NotificationStore;
  futsal?: (url: string) => FutsalStore;
  coupons?: (url: string) => CouponStore;
};
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const authRoutes = new Set([
  "sign-up/email",
  "sign-in/email",
  "sign-out",
  "get-session",
  "email-otp/send-verification-otp",
  "email-otp/verify-email",
  "forget-password",
  "request-password-reset",
  "reset-password",
  "email-otp/reset-password",
]);
function cookieHeaders(request: Request) {
  const headers = new Headers({
    Accept: "application/json",
    "Cache-Control": "no-cache",
  });
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .filter((part) => !part.trim().startsWith("himmah_locale="))
    .join(";")
    .trim();
  if (cookie) headers.set("cookie", cookie);
  return headers;
}
async function identify(
  request: Request,
  env: Env,
  fetcher: typeof fetch,
): Promise<Identity | null> {
  if (!cookieHeaders(request).has("cookie")) return null;
  const result = await fetcher(
    `${env.HIMMAH_AUTH_URL}/get-session?disableCookieCache=true`,
    { headers: cookieHeaders(request), redirect: "manual" },
  );
  if (!result.ok) return null;
  const data = (await result.json()) as { user?: Identity } | null;
  if (!data?.user?.id) return null;
  return data.user;
}
function origin(env: Env) {
  const url = new URL(env.HIMMAH_APP_ORIGIN);
  return url.origin;
}
export function createHandler(
  deps: Dependencies = {
    // Workers' native fetch requires its global receiver. A bare reference stored
    // on deps is invoked with deps as `this` and throws "Illegal invocation".
    fetch: (input, init) => globalThis.fetch(input, init),
    store: createStore,
  },
) {
  return async function handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!env.HIMMAH_AUTH_URL || !env.HIMMAH_APP_ORIGIN)
      return json({ error: "Account services are not configured yet." }, 503);
    try {
      const appOrigin = origin(env);
      if (!["GET", "HEAD"].includes(request.method)) {
        try {
          requireSameOrigin(request, appOrigin);
        } catch {
          return json({ error: "Request origin not allowed." }, 403);
        }
        if (
          request.headers.get("content-type")?.split(";")[0] !==
          "application/json"
        )
          return json({ error: "Use a JSON request." }, 415);
      }
      if (url.pathname.startsWith("/api/auth/")) {
        const path = url.pathname.slice("/api/auth/".length);
        if (!authRoutes.has(path))
          return json({ error: "Auth endpoint not available." }, 404);
        if (request.method !== "GET" && request.method !== "POST")
          return json({ error: "Method not allowed." }, 405);
        if (request.method === "GET" && path !== "get-session")
          return json({ error: "Method not allowed." }, 405);
        if (request.method === "POST") {
          const allowed = await env.ONBOARDING_LIMITER.limit({
            key: `auth:${request.headers.get("cf-connecting-ip") ?? "local"}`,
          });
          if (!allowed.success)
            return json(
              {
                error: "Too many requests. Please wait a minute and try again.",
                message:
                  "Too many requests. Please wait a minute and try again.",
                code: "TOO_MANY_REQUESTS",
              },
              429,
            );
        }
        const body =
          request.method === "POST" ? await request.text() : undefined;
        if (body && body.length > 16000)
          return json({ error: "Request too large." }, 413);
        const headers = cookieHeaders(request);
        // Match the managed SDK's server proxy contract. Origin validation above
        // still runs before this server-controlled marker is attached.
        headers.set("x-neon-auth-middleware", "true");
        for (const name of ["user-agent", "x-neon-client-info"]) {
          const value = request.headers.get(name);
          if (value) headers.set(name, value);
        }
        headers.set("Origin", appOrigin);
        headers.set("Referer", `${appOrigin}/start`);
        if (body) headers.set("Content-Type", "application/json");
        const init: RequestInit = {
          method: request.method,
          headers,
          redirect: "manual",
        };
        if (body !== undefined) init.body = body;
        // Only pinned authentication endpoints are proxied, never an arbitrary host/path.
        const upstream = await deps.fetch(
          `${env.HIMMAH_AUTH_URL}/${path}${path === "get-session" ? "?disableCookieCache=true" : ""}`,
          init,
        );
        const responseHeaders = new Headers({
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Type":
            upstream.headers.get("content-type") ?? "application/json",
        });
        for (const cookie of upstream.headers.getSetCookie()) {
          const sameOriginCookie = cookie
            .replace(/;\s*Domain=[^;]+/gi, "")
            .replace(/;\s*Path=[^;]+/gi, "; Path=/");
          responseHeaders.append(
            "Set-Cookie",
            /;\s*Path=/i.test(sameOriginCookie)
              ? sameOriginCookie
              : `${sameOriginCookie}; Path=/`,
          );
        }
        return new Response(upstream.body, {
          status: upstream.status,
          headers: responseHeaders,
        });
      }
      const user = await identify(request, env, deps.fetch);
      if (!user) return json({ error: "Sign in to continue." }, 401);
      if (url.pathname === "/api/account" && request.method === "GET")
        return json({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
          },
        });
      if (!env.HIMMAH_DATABASE_URL)
        return json({ error: "Workspace storage is not configured yet." }, 503);
      const store = deps.store(env.HIMMAH_DATABASE_URL);
      if (/^\/api\/organizations\/[^/]+\/futsal(\/|$)/.test(url.pathname)) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({ key: `futsal:${user.id}` });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        const response = await futsalApi(
          request,
          user,
          store,
          (deps.futsal ?? createFutsalStore)(env.HIMMAH_DATABASE_URL),
        );
        if (response) return response;
      }

      if (
        /^\/api\/(organizations\/[^/]+\/notifications|notifications\/push)(\/|$)/.test(
          url.pathname,
        )
      ) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({ key: `notifications:${user.id}` });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        const response = await notificationApi(
          request,
          user,
          store,
          (deps.notifications ?? createNotificationStore)(
            env.HIMMAH_DATABASE_URL,
          ),
          env.HIMMAH_VAPID_PRIVATE_KEY
            ? (env.HIMMAH_VAPID_PUBLIC_KEY ?? null)
            : null,
        );
        if (response) return response;
      }

      if (
        /^\/api\/organizations\/[^/]+\/(me\/)?challenges(\/|$)/.test(
          url.pathname,
        )
      ) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({ key: `challenges:${user.id}` });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        const response = await challengeApi(
          request,
          user,
          store,
          (deps.challenges ?? createChallengeStore)(env.HIMMAH_DATABASE_URL),
        );
        if (response) return response;
      }
      if (
        /^\/api\/organizations\/[^/]+\/(me\/(claims|coupons)|coupon-collection)(\/|$)/.test(
          url.pathname,
        )
      ) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({ key: `coupons:${user.id}` });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        const response = await couponApi(
          request,
          user,
          store,
          (deps.coupons ?? createCouponStore)(env.HIMMAH_DATABASE_URL),
        );
        if (response) return response;
      }
      if (
        /^\/api\/organizations\/[^/]+\/(me|participants)(\/|$)/.test(
          url.pathname,
        ) ||
        url.pathname.startsWith("/api/participant-invitations/")
      ) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({ key: `participants:${user.id}` });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        const response = await participantApi(
          request,
          user,
          store,
          createParticipantStore(env.HIMMAH_DATABASE_URL),
        );
        if (response) return response;
      }
      if (
        /^\/api\/organizations\/[^/]+\/(access|work)(\/|$)/.test(url.pathname)
      ) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({ key: `access:${user.id}` });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        const response = await accessApi(
          request,
          user,
          store,
          createAccessStore(env.HIMMAH_DATABASE_URL),
        );
        if (response) return response;
      }
      if (
        /^\/api\/organizations\/[^/]+\/(points|members)(\/|$)/.test(
          url.pathname,
        )
      ) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({ key: `points:${user.id}` });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        const response = await pointsApi(
          request,
          user,
          store,
          createPointsStore(env.HIMMAH_DATABASE_URL),
        );
        if (response) return response;
      }
      if (
        /^\/api\/organizations\/[^/]+\/(rewards|reward-wallet)(\/|$)/.test(
          url.pathname,
        )
      ) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({ key: `rewards:${user.id}` });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        const response = await rewardApi(
          request,
          user,
          store,
          createRewardStore(env.HIMMAH_DATABASE_URL),
        );
        if (response) return response;
      }
      if (/^\/api\/organizations\/[^/]+\/periods(\/|$)/.test(url.pathname)) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({ key: `periods:${user.id}` });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        const response = await periodApi(
          request,
          user,
          store,
          createPeriodStore(env.HIMMAH_DATABASE_URL),
        );
        if (response) return response;
      }
      if (/^\/api\/organizations\/[^/]+\/activities(\/|$)/.test(url.pathname)) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({ key: `activities:${user.id}` });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        if (url.pathname.includes("/attendance")) {
          const attendanceResponse = await attendanceApi(
            request,
            user,
            store,
            createActivityStore(env.HIMMAH_DATABASE_URL),
            createAttendanceStore(env.HIMMAH_DATABASE_URL),
          );
          if (attendanceResponse) return attendanceResponse;
        }
        const response = await activityApi(
          request,
          user,
          store,
          createActivityStore(env.HIMMAH_DATABASE_URL),
        );
        if (response) return response;
      }
      if (
        /^\/api\/organizations\/[^/]+\/(people|groups|staff|invitations)(\/|$)/.test(
          url.pathname,
        ) ||
        url.pathname.startsWith("/api/invitations/")
      ) {
        if (request.method !== "GET") {
          const allowed = await (
            env.DIRECTORY_LIMITER ?? env.ONBOARDING_LIMITER
          ).limit({
            key: `directory:${user.id}`,
          });
          if (!allowed.success) return json({ code: "rate_limit" }, 429);
        }
        const response = await communityApi(
          request,
          user,
          store,
          (deps.directory ?? createCommunityStore)(env.HIMMAH_DATABASE_URL),
        );
        if (response) return response;
      }
      if (url.pathname === "/api/organizations" && request.method === "GET") {
        const input = pageInput(url, "organizations:" + user.id);
        const page = pageResult(await store.list(user.id, input), input);
        return json({ organizations: page.items, nextCursor: page.nextCursor });
      }
      if (url.pathname === "/api/organizations" && request.method === "POST") {
        if (!user.emailVerified)
          return json(
            {
              error: "Verify your email before creating an organization.",
              code: "EMAIL_NOT_VERIFIED",
            },
            403,
          );
        const body = await request.text();
        if (body.length > 8000)
          return json({ error: "Request too large." }, 413);
        let input;
        try {
          input = validateOrganization(JSON.parse(body));
        } catch (e) {
          return json(
            { error: e instanceof Error ? e.message : "Invalid organization." },
            400,
          );
        }
        const allowed = await env.ONBOARDING_LIMITER.limit({
          key: `organization:${user.id}`,
        });
        if (!allowed.success)
          return json(
            { error: "Too many requests. Please wait a minute and try again." },
            429,
          );
        try {
          return json(
            { organization: await store.create(user.id, input) },
            201,
          );
        } catch (e) {
          const error = e as { code?: string; cause?: { code?: string } };
          if (error.code === "23505" || error.cause?.code === "23505")
            return json(
              {
                error: "That workspace address is already taken. Try another.",
              },
              409,
            );
          throw e;
        }
      }
      const match = url.pathname.match(
        /^\/api\/organizations\/([0-9a-f-]{36})$/i,
      );
      if (match && request.method === "GET") {
        const organization = await store.get(user.id, match[1]!);
        return organization
          ? json({ organization })
          : json({ error: "Workspace not found." }, 404);
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof CommunityError)
        return json({ code: error.code }, error.status);
      return json(
        {
          error:
            "Account service is temporarily unavailable. Please try again.",
        },
        503,
      );
    }
  };
}
export default { fetch: createHandler() };
