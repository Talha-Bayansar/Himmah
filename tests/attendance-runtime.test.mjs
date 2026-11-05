import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
test("Worker serves suggested attendance and retains current access and mutation security gates", async () => {
  const org = "11111111-1111-4111-8111-111111111111",
    activity = "22222222-2222-4222-8222-222222222222",
    session = "33333333-3333-4333-8333-333333333333",
    person = "44444444-4444-4444-8444-444444444444";
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import {createHandler} from './src/server/worker.ts';export default{fetch(request){return createHandler({fetch:async()=>Response.json({user:{id:'owner',emailVerified:request.headers.get('x-test-unverified')!=='true'}}),store:()=>({get:async()=>({role:'owner'})}),activities:()=>({session:async()=>[{id:'${session}'}]}),attendance:()=>({canSession:async()=>request.headers.get('x-test-denied')==='true'?[]:[{allowed:1}],list:async(...args)=>{if(args[6]!=='suggested') throw Error('Missing suggested route');return [{id:'${person}',name:'Synthetic attendee',createdAt:'2020-01-01T00:00:00Z',eligible:true,status:'unmarked',version:0}];},summary:async()=>[{present:0,canEdit:true}],manage:async()=>[{result:{items:[{personId:'${person}',outcome:'saved',version:1,status:'present'}]}}]})})(request,{HIMMAH_APP_ORIGIN:'https://himmah.test',HIMMAH_AUTH_URL:'https://auth.invalid',HIMMAH_DATABASE_URL:'isolated',HIMMAH_PEOPLE_ENABLED:'true',ONBOARDING_LIMITER:{limit:async()=>({success:true})},DIRECTORY_LIMITER:{limit:async()=>({success:request.headers.get('x-test-rate')!=='true'})},ASSETS:{fetch:async()=>new Response('asset')}});}};`,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2023",
    external: ["node:*"],
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "attendance",
          modules: true,
          script: output.outputFiles[0].text,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
        },
      ],
    }),
  );
  try {
    const url = `https://himmah.test/api/organizations/${org}/activities/${activity}/sessions/${session}/attendance`;
    const get = await mf.dispatchFetch(url + "?roster=suggested", {
      headers: { cookie: "session=fixture" },
    });
    assert.equal(get.status, 200);
    assert.equal(get.headers.get("cache-control"), "no-store");
    assert.equal((await get.json()).items[0].name, "Synthetic attendee");
    for (const header of ["x-test-denied", "x-test-unverified"])
      assert.equal(
        (
          await mf.dispatchFetch(url + "?roster=suggested", {
            headers: { cookie: "session=fixture", [header]: "true" },
          })
        ).status,
        403,
      );
    assert.equal(
      (
        await mf.dispatchFetch(url + "?roster=unbounded", {
          headers: { cookie: "session=fixture" },
        })
      ).status,
      400,
    );
    const post = {
      method: "POST",
      headers: {
        cookie: "session=fixture",
        origin: "https://himmah.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        key: crypto.randomUUID(),
        action: "add",
        items: [{ personId: person, version: 0 }],
      }),
    };
    assert.equal((await mf.dispatchFetch(url, post)).status, 200);
    assert.equal(
      (
        await mf.dispatchFetch(url, {
          ...post,
          headers: { ...post.headers, origin: "https://wrong.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await mf.dispatchFetch(url, {
          ...post,
          headers: { ...post.headers, "content-type": "text/plain" },
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await mf.dispatchFetch(url, {
          ...post,
          headers: { ...post.headers, "x-test-rate": "true" },
        })
      ).status,
      429,
    );
  } finally {
    await mf.dispose();
  }
});
