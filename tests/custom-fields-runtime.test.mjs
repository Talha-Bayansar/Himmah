import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("Worker routes custom-field reads/writes through People authorization and mutation gates", async () => {
  const org = "11111111-1111-4111-8111-111111111111";
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import {createHandler} from './src/server/worker.ts';
 export default {fetch(request){const handler=createHandler({fetch:async()=>Response.json({user:{id:'owner',emailVerified:request.headers.get('x-test-unverified')!=='true'}}),store:()=>{throw Error('Custom fields must reach People');},people:()=>({context:async()=>request.headers.get('x-test-denied')==='true'?null:{id:'${org}'},fields:async()=>({fields:[],snapshot:'a'.repeat(32)}),fieldCommand:async()=>({id:'${org}',replayed:false})})});return handler(request,{HIMMAH_APP_ORIGIN:'https://himmah.test',HIMMAH_AUTH_URL:'https://auth.invalid',HIMMAH_DATABASE_URL:'isolated',HIMMAH_PEOPLE_ENABLED:request.headers.get('x-test-disabled')==='true'?'false':'true',ONBOARDING_LIMITER:{limit:async()=>({success:true})},DIRECTORY_LIMITER:{limit:async()=>({success:request.headers.get('x-test-rate')!=='true'})},ASSETS:{fetch:async()=>new Response('asset')}});}};`,
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
          name: "custom-fields-fixture",
          modules: true,
          script: output.outputFiles[0].text,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
        },
      ],
    }),
  );
  try {
    const url = `https://himmah.test/api/organizations/${org}/people/custom-fields`;
    const result = await mf.dispatchFetch(url, {
      headers: { cookie: "session=fixture" },
    });
    assert.equal(result.status, 200);
    assert.match(result.headers.get("cache-control"), /no-store/);
    assert.deepEqual(await result.json(), {
      fields: [],
      snapshot: "a".repeat(32),
    });
    const body = JSON.stringify({
      operation: "create",
      key: org,
      label: "Language",
      kind: "text",
      required: false,
      options: [],
    });
    const post = (extra = {}) =>
      mf.dispatchFetch(url, {
        method: "POST",
        headers: {
          cookie: "session=fixture",
          origin: "https://himmah.test",
          "content-type": "application/json",
          ...extra,
        },
        body,
      });
    assert.equal((await post()).status, 200);
    assert.equal(
      (await post({ origin: "https://foreign.invalid" })).status,
      403,
    );
    assert.equal((await post({ "content-type": "text/plain" })).status, 415);
    assert.equal((await post({ "x-test-rate": "true" })).status, 429);
    for (const [header, status] of [
      ["x-test-unverified", 403],
      ["x-test-disabled", 503],
      ["x-test-denied", 404],
    ])
      assert.equal(
        (
          await mf.dispatchFetch(url, {
            headers: { cookie: "session=fixture", [header]: "true" },
          })
        ).status,
        status,
      );
  } finally {
    await mf.dispose();
  }
});
