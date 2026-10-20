import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import { createECDH, randomBytes } from "node:crypto";
test("real Worker runtime encrypts and signs Web Push, uses native fetch, retries throttling and removes expired devices", async () => {
  const vapid = webpush.generateVAPIDKeys(),
    ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const keys = {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
  const bundle = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
      contents: `import {deliverPush} from './src/server/push-delivery.ts';
 export default {async fetch(request){
 let result={};const status=new URL(request.url).searchParams.get('status')??'201';
 const store={claim:async()=>[{id:'test',lease:'lease',attempts:1}],target:async()=>[{organizationId:'11111111-1111-4111-8111-111111111111',deviceId:'device',endpoint:'https://fcm.googleapis.com/test/'+status,locale:'tr',...${JSON.stringify(keys)}}],finish:async(id,lease,state,delay)=>{result={state,delay};return[];},expired:async()=>{result={expired:true};return[];}};
 await deliverPush({HIMMAH_DATABASE_URL:'test',HIMMAH_APP_ORIGIN:'https://himmah.example',HIMMAH_VAPID_PUBLIC_KEY:${JSON.stringify(vapid.publicKey)},HIMMAH_VAPID_PRIVATE_KEY:${JSON.stringify(vapid.privateKey)}},{store});return Response.json(result);}}
 `,
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
          name: "push-test",
          modules: true,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
          script: bundle.outputFiles[0].text,
          outboundService: "push-fixture",
        },
        {
          name: "push-fixture",
          modules: true,
          compatibilityDate: "2026-10-18",
          script: `export default {async fetch(request){if(request.headers.get('content-encoding')!=='aes128gcm'||!request.headers.get('authorization')?.startsWith('vapid ')||(await request.arrayBuffer()).byteLength<80)return new Response(null,{status:400});return new Response(null,{status:Number(new URL(request.url).pathname.split('/').pop()),headers:{'Retry-After':'120'}});}}`,
        },
      ],
    }),
  );
  try {
    assert.equal(
      (await (await mf.dispatchFetch("https://test.invalid?status=201")).json())
        .state,
      "sent",
    );
    const retry = await (
      await mf.dispatchFetch("https://test.invalid?status=429")
    ).json();
    assert.equal(retry.state, "pending");
    assert.equal(retry.delay, 120);
    assert.equal(
      (await (await mf.dispatchFetch("https://test.invalid?status=410")).json())
        .expired,
      true,
    );
  } finally {
    await mf.dispose();
  }
});
