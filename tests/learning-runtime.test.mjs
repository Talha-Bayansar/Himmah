import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
test("real Worker exchanges fragment credentials for scoped HttpOnly cookies without invoking staff authentication", async () => {
  const origin = "https://himmah.example",
    item = "11111111-1111-4111-8111-111111111111";
  const output = await build({
    stdin: {
      contents: `import {createHandler} from './src/server/worker.ts';
 const expected='ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb';
 const handler=createHandler({fetch:async()=>{throw Error('staff auth must not run')},learning:()=>({public:async(item,credential)=>[{result:credential===expected?{title:'Synthetic public quiz',questions:[],available:true}:{error:'not_found'}}],participate:async(item,credential,resume,key,p)=>[{result:credential===expected&&p.guestHash?.length===64&&p.guestHash!=='b'.repeat(64)?{id:item,revision:1,guestStarted:true}:{error:'not_found'}}]})});
 export default {fetch(request){return handler(request,{HIMMAH_APP_ORIGIN:'${origin}',HIMMAH_AUTH_URL:'https://auth.invalid/auth',HIMMAH_DATABASE_URL:'isolated-test',HIMMAH_PEOPLE_ENABLED:'true',ONBOARDING_LIMITER:{limit:async()=>({success:true})},ASSETS:{fetch:async()=>new Response('',{status:404})}})}};`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2023",
    external: ["node:*"],
  });
  const mf = new Miniflare(
    await convertV4MiniflareOptions({
      workers: [
        {
          name: "learning-fixture",
          modules: true,
          script: output.outputFiles[0].text,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
        },
      ],
    }),
  );
  try {
    const base = origin + "/api/learning/public/" + item;
    const missing = await mf.dispatchFetch(base);
    assert.equal(missing.status, 404);
    const access = await mf.dispatchFetch(base + "/access", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(64) }),
    });
    assert.equal(access.status, 200);
    assert.equal(access.headers.get("cache-control"), "no-store");
    assert.match(
      access.headers.get("set-cookie"),
      /HttpOnly; Secure; SameSite=Strict/,
    );
    assert.match(
      access.headers.get("set-cookie"),
      new RegExp("Path=/api/learning/public/" + item),
    );
    assert.deepEqual(await access.json(), { ok: true });
    const get = await mf.dispatchFetch(base, {
      headers: { Cookie: "hl_access=" + "a".repeat(64) },
    });
    assert.equal(get.status, 200);
    const start = await mf.dispatchFetch(base + "/command", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: "hl_access=" + "a".repeat(64),
      },
      body: JSON.stringify({
        action: "start",
        key: crypto.randomUUID(),
        name: "Guest",
        guestToken: "b".repeat(64),
      }),
    });
    assert.equal(start.status, 200);
    assert.match(start.headers.get("set-cookie"), /hl_resume=/);
    assert.match(
      start.headers.get("set-cookie"),
      /HttpOnly; Secure; SameSite=Strict/,
    );
    const badOrigin = await mf.dispatchFetch(base + "/access", {
      method: "POST",
      headers: {
        Origin: "https://other.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "a".repeat(64) }),
    });
    assert.equal(badOrigin.status, 403);
  } finally {
    await mf.dispose();
  }
});

test("real Worker protects contact learning history with staff auth, verification, membership and feature gates", async () => {
  const origin = "https://himmah.example",
    org = "11111111-1111-4111-8111-111111111111",
    contact = "22222222-2222-4222-8222-222222222222";
  const output = await build({
    stdin: {
      contents: `import {createHandler} from './src/server/worker.ts';
    const handler=createHandler({fetch:async(url,init)=>{const id=init.headers.get('cookie').split('=')[1];return Response.json({user:{id,emailVerified:id!=='unverified'}})},store:()=>({get:async(actor,tenant)=>tenant==='${org}'&&actor!=='foreign'?{role:actor==='volunteer'?'volunteer':'owner'}:null}),learning:()=>({contactHistory:async(actor,tenant,person,p)=>person==='${contact}'?{items:[],total:0}:null})});
    export default {fetch(request){const u=new URL(request.url);return handler(request,{HIMMAH_APP_ORIGIN:'${origin}',HIMMAH_AUTH_URL:'https://auth.invalid/auth',HIMMAH_DATABASE_URL:'isolated-test',HIMMAH_PEOPLE_ENABLED:u.searchParams.get('disabled')?'false':'true',ONBOARDING_LIMITER:{limit:async()=>({success:true})},ASSETS:{fetch:async()=>new Response('',{status:404})}})}};`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2023",
    external: ["node:*"],
  });
  const mf = new Miniflare(
    await convertV4MiniflareOptions({
      workers: [
        {
          name: "learning-history-fixture",
          modules: true,
          script: output.outputFiles[0].text,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
        },
      ],
    }),
  );
  try {
    const url = `${origin}/api/organizations/${org}/learning/contacts/${contact}`;
    assert.equal((await mf.dispatchFetch(url)).status, 401);
    for (const [actor, status] of [
      ["owner", 200],
      ["volunteer", 403],
      ["foreign", 404],
      ["unverified", 403],
    ]) {
      const response = await mf.dispatchFetch(url, {
        headers: { Cookie: `session=${actor}` },
      });
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal(
      (
        await mf.dispatchFetch(url + "?disabled=1", {
          headers: { Cookie: "session=owner" },
        })
      ).status,
      503,
    );
    assert.equal(
      (
        await mf.dispatchFetch(url + "?limit=51", {
          headers: { Cookie: "session=owner" },
        })
      ).status,
      400,
    );
  } finally {
    await mf.dispose();
  }
});
