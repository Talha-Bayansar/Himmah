import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://himmah.example";
async function worker(sourceOverride) {
  const result = await build({
    stdin: {
      contents: `import handler from './src/server/worker.ts';
        export default { fetch(request) { return handler.fetch(request, {
          HIMMAH_APP_ORIGIN: ${JSON.stringify(origin)},
          HIMMAH_AUTH_URL: 'https://auth.example.invalid/auth',
          ONBOARDING_LIMITER: { limit: async () => ({success:true}) },
          ASSETS: {fetch: async () => new Response(null,{status:404})},
        }); } };`,
      resolveDir: root,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2023",
    external: ["node:*"],
    ...(sourceOverride
      ? {
          plugins: [
            {
              name: "regression",
              setup(build) {
                build.onLoad(
                  { filter: /src\/server\/worker\.ts$/ },
                  async ({ path }) => {
                    const { readFile } = await import("node:fs/promises");
                    return {
                      contents: (await readFile(path, "utf8")).replace(
                        "fetch: (input, init) => globalThis.fetch(input, init)",
                        "fetch: globalThis.fetch",
                      ),
                      loader: "ts",
                    };
                  },
                );
              },
            },
          ],
        }
      : {}),
  });
  return new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "himmah",
          modules: true,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
          script: result.outputFiles[0].text,
          outboundService: "auth-fixture",
        },
        {
          name: "auth-fixture",
          modules: true,
          compatibilityDate: "2026-10-18",
          script: `
        const user={id:'runtime-organizer',name:'Test Organizer',email:'organizer@example.invalid',emailVerified:false};
        export default {async fetch(request) {
          const path=new URL(request.url).pathname;
          if (path === '/auth/get-session') return Response.json({user,session:{id:'fixture-session'}});
          if (request.headers.get('x-neon-auth-middleware') !== 'true') return new Response(null,{status:400});
          if (request.headers.get('origin') !== ${JSON.stringify(origin)}) return new Response(null,{status:403});
          if (path === '/auth/sign-up/email') {
            const body=await request.json();
            if (body.email !== user.email) return new Response(null,{status:400});
            return Response.json({user,token:'test-only-token'},{status:201,headers:{'Set-Cookie':'neon-auth.session_token=test-only-token; Domain=auth.example.invalid; Path=/auth; Secure; HttpOnly; SameSite=Lax'}});
          }
          if (path === '/auth/email-otp/send-verification-otp') return Response.json({success:true});
          return new Response(null,{status:404});
        }}
      `,
        },
      ],
    }),
  );
}

// The fixture is a second local Worker. No request reaches a real auth service,
// no account is created and no verification email is sent.
test("Cloudflare runtime reproduces the previous native-fetch receiver failure", async () => {
  const mf = await worker(true);
  try {
    const response = await mf.dispatchFetch(origin + "/api/auth/get-session");
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /temporarily unavailable/);
  } finally {
    await mf.dispose();
  }
});
test("real Worker signup, verification and session lookup work through native fetch", async () => {
  const mf = await worker(false);
  try {
    const response = await mf.dispatchFetch(
      origin + "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Organizer",
          email: "organizer@example.invalid",
          password: "test-only-password-123",
        }),
      },
    );
    assert.equal(response.status, 201);
    assert.equal((await response.json()).user.id, "runtime-organizer");
    const cookie = response.headers.get("Set-Cookie");
    assert.match(cookie, /Path=\//);
    assert.ok(!cookie.includes("Domain="));
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const verify = await mf.dispatchFetch(
      origin + "/api/auth/email-otp/send-verification-otp",
      {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "organizer@example.invalid",
          type: "email-verification",
        }),
      },
    );
    assert.equal(verify.status, 200);
    const account = await mf.dispatchFetch(origin + "/api/account", {
      headers: { Cookie: "neon-auth.session_token=test-only-token" },
    });
    assert.equal(account.status, 200);
    assert.equal((await account.json()).user.id, "runtime-organizer");
    const blocked = await mf.dispatchFetch(origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        Origin: "https://other.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(blocked.status, 403);
  } finally {
    await mf.dispose();
  }
});
