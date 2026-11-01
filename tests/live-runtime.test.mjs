import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
test("real Worker live routes require same-origin JSON, scope guest cookies and separate guests from staff auth and rate limits", async () => {
  const origin = "https://himmah.example",
    code = "ABCDEF1234",
    org = "11111111-1111-4111-8111-111111111111",
    item = "22222222-2222-4222-8222-222222222222";
  const output = await build({
    stdin: {
      contents: `import {createHandler} from './src/server/worker.ts';
 const handler=createHandler({fetch:async(url,init)=>Response.json({user:{id:init.headers.get('cookie')?.includes('staff=owner')?'owner':'helper',emailVerified:true}}),store:()=>({get:async(actor)=>({role:actor==='owner'?'owner':'volunteer'})}),live:()=>({public:async(code,hash)=>[{result:{title:'Live fixture',joined:!!hash,hashLength:hash.length}}],guest:async(code,hash,key,p)=>[{result:{id:'${item}',revision:1,hashLength:hash.length,hasRawToken:!!p.token}}],list:async()=>[]})});
 export default {fetch(request){const u=new URL(request.url);return handler(request,{HIMMAH_APP_ORIGIN:'${origin}',HIMMAH_AUTH_URL:'https://auth.invalid/auth',HIMMAH_DATABASE_URL:'isolated',HIMMAH_PEOPLE_ENABLED:u.searchParams.has('disabled')?'false':'true',HIMMAH_MAINTENANCE:u.searchParams.has('maintenance')?'true':'false',ONBOARDING_LIMITER:{limit:async()=>({success:true})},LIVE_JOIN_LIMITER:{limit:async()=>({success:!u.searchParams.has('rate')})},LIVE_IP_LIMITER:{limit:async()=>({success:!u.searchParams.has('iprate')})},ASSETS:{fetch:async()=>new Response('',{status:404})}})}};`,
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
          name: "live-fixture",
          modules: true,
          script: output.outputFiles[0].text,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
        },
      ],
    }),
  );
  try {
    const url = origin + "/api/live/rooms/" + code,
      token = "a".repeat(64),
      body = JSON.stringify({ key: crypto.randomUUID(), token, nickname: "" });
    const initial = await mf.dispatchFetch(url);
    assert.equal(initial.status, 200);
    assert.equal(initial.headers.get("cache-control"), "no-store");
    assert.equal((await initial.json()).joined, false);
    const joined = await mf.dispatchFetch(url + "/join", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body,
    });
    assert.equal(joined.status, 200);
    assert.match(
      joined.headers.get("set-cookie"),
      /HttpOnly; Secure; SameSite=Strict/,
    );
    assert.match(
      joined.headers.get("set-cookie"),
      new RegExp(`Path=/api/live/rooms/${code}`),
    );
    assert.equal((await joined.json()).hasRawToken, false);
    const resumed = await mf.dispatchFetch(url, {
      headers: { Cookie: "hl_live=" + token },
    });
    assert.equal((await resumed.json()).hashLength, 64);
    for (const originHeader of ["", "https://foreign.test"])
      assert.equal(
        (
          await mf.dispatchFetch(url + "/join", {
            method: "POST",
            headers: {
              Origin: originHeader,
              "Content-Type": "application/json",
            },
            body,
          })
        ).status,
        403,
      );
    assert.equal(
      (
        await mf.dispatchFetch(url + "/join", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "text/plain" },
          body,
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await mf.dispatchFetch(url + "/join?rate=1", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body,
        })
      ).status,
      429,
    );
    assert.equal((await mf.dispatchFetch(url + "?iprate=1")).status, 429);
    assert.equal((await mf.dispatchFetch(url + "?disabled=1")).status, 503);
    assert.equal((await mf.dispatchFetch(url + "?maintenance=1")).status, 503);
    const staff =
      origin + "/api/organizations/" + org + "/learning/" + item + "/live";
    assert.equal((await mf.dispatchFetch(staff)).status, 401);
    assert.equal(
      (await mf.dispatchFetch(staff, { headers: { Cookie: "staff=helper" } }))
        .status,
      403,
    );
    assert.equal(
      (await mf.dispatchFetch(staff, { headers: { Cookie: "staff=owner" } }))
        .status,
      200,
    );
  } finally {
    await mf.dispose();
  }
});
