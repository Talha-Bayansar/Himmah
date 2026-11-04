import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
test("actual Worker emits a private UTF-8 formula-safe CSV and enforces admin/verification/gates/size errors", async () => {
  const org = "11111111-1111-4111-8111-111111111111";
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import {createHandler} from './src/server/worker.ts';
 export default {fetch(request){const role=request.headers.get('x-test-role')??'owner';const handler=createHandler({fetch:async()=>Response.json({user:{id:'staff',emailVerified:request.headers.get('x-test-unverified')!=='true'}}),store:()=>({get:async()=>({role,timezone:'Europe/Brussels'})}),exports:()=>({context:async()=>({organizationName:'Synthetic',timezone:'Europe/Brussels'}),data:async()=>({organizationName:'Synthetic',timezone:'Europe/Brussels',activityName:null,groupName:null,sessionName:null,generatedAt:'2026-11-04T12:00:00.000Z',tooLarge:request.headers.get('x-test-large')==='true',items:[{id:'${org}',name:'=1+1',givenName:'Ayşe',familyName:'Öztürk',email:'ayse@example.test',phone:'+32470123456',archived:false,groupCount:0,createdAt:'2026-11-04T00:00:00Z'}]})})});return handler(request,{HIMMAH_APP_ORIGIN:'https://himmah.test',HIMMAH_AUTH_URL:'https://auth.invalid',HIMMAH_DATABASE_URL:'isolated',HIMMAH_PEOPLE_ENABLED:request.headers.get('x-test-disabled')==='true'?'false':'true',ONBOARDING_LIMITER:{limit:async()=>({success:true})},DIRECTORY_LIMITER:{limit:async()=>({success:request.headers.get('x-test-rate')!=='true'})},ASSETS:{fetch:async()=>new Response('asset')}});}};`,
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
          name: "exports-fixture",
          modules: true,
          script: output.outputFiles[0].text,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
        },
      ],
    }),
  );
  try {
    const url = `https://himmah.test/api/organizations/${org}/exports?kind=contacts&locale=tr`;
    const result = await mf.dispatchFetch(url, {
      headers: { cookie: "session=fixture" },
    });
    assert.equal(result.status, 200);
    assert.match(result.headers.get("cache-control"), /no-store/);
    assert.equal(result.headers.get("content-language"), "tr");
    assert.equal(result.headers.get("x-himmah-export-rows"), "1");
    assert.match(
      result.headers.get("content-disposition"),
      /^attachment; filename="himmah-contacts-active-tr.csv"$/,
    );
    const bytes = new Uint8Array(await result.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
    const csv = new TextDecoder().decode(bytes);
    assert.ok(csv.includes("Kişi kimliği"));
    assert.ok(csv.includes("Ayşe"));
    assert.ok(csv.includes('"\'=1+1"'));
    assert.ok(csv.includes('"\'+32470123456"'));
    for (const [header, value, status] of [
      ["x-test-role", "volunteer", 403],
      ["x-test-unverified", "true", 403],
      ["x-test-disabled", "true", 503],
      ["x-test-rate", "true", 429],
      ["x-test-large", "true", 413],
    ]) {
      const response = await mf.dispatchFetch(url, {
        headers: { [header]: value, cookie: "session=fixture" },
      });
      assert.equal(response.status, status);
      assert.match(response.headers.get("content-type"), /application\/json/);
    }
    const rejected = await mf.dispatchFetch(url, {
      method: "POST",
      headers: {
        origin: "https://other.invalid",
        cookie: "session=fixture",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(rejected.status, 403);
  } finally {
    await mf.dispose();
  }
});
