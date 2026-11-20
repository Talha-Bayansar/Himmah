import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
test("real SQLite Durable Object persists deadlines, runs an actual alarm once and stays dormant after empty work", async () => {
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import {NotificationClock} from './src/server/notification-clock.ts';
 export class TestClock extends NotificationClock {constructor(ctx,env){super(ctx,{HIMMAH_DATABASE_URL:'never-network',HIMMAH_APP_ORIGIN:'https://test'},async()=>{await ctx.storage.put('runs',(await ctx.storage.get('runs')??0)+1);},async()=>null);this.context=ctx;}
 async fetch(request){if(new URL(request.url).pathname==='/inspect')return Response.json({runs:await this.context.storage.get('runs')??0,alarm:await this.context.storage.getAlarm()});return super.fetch(request);}}
 export default {fetch(request,env){return env.CLOCK.get(env.CLOCK.idFromName('test')).fetch(request);}};`,
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
          name: "clock-test",
          modules: true,
          script: output.outputFiles[0].text,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
          durableObjects: {
            CLOCK: { className: "TestClock", useSQLite: true },
          },
        },
      ],
    }),
  );
  try {
    const call = (path, body = {}) =>
      mf.dispatchFetch("https://test" + path, {
        method: "POST",
        body: JSON.stringify(body),
      });
    assert.equal((await call("/ensure")).status, 204);
    let result;
    for (let i = 0; i < 50; i++) {
      result = await (await mf.dispatchFetch("https://test/inspect")).json();
      if (result.runs === 1) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(result.runs, 1);
    assert.equal(result.alarm, null);
    for (let i = 0; i < 10; i++) await call("/ensure");
    result = await (await mf.dispatchFetch("https://test/inspect")).json();
    assert.equal(result.runs, 1);
    assert.equal(result.alarm, null);
    const token = crypto.randomUUID();
    await call("/begin", { token });
    result = await (await mf.dispatchFetch("https://test/inspect")).json();
    assert.ok(result.alarm > Date.now() + 200000);
    await call("/finish", { token, ok: true });
    for (let i = 0; i < 50; i++) {
      result = await (await mf.dispatchFetch("https://test/inspect")).json();
      if (result.runs === 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(result.runs, 2);
    assert.equal(result.alarm, null);
  } finally {
    await mf.dispose();
  }
});

test("Worker authorizes before reserving clock work and never commits a mutation without a durable wake intent", async () => {
  const org = "11111111-1111-4111-8111-111111111111",
    activity = "22222222-2222-4222-8222-222222222222",
    session = "33333333-3333-4333-8333-333333333333",
    person = "44444444-4444-4444-8444-444444444444";
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import {NotificationClock} from './src/server/notification-clock.ts';import{createHandler}from'./src/server/worker.ts';
 export class TestClock extends NotificationClock{constructor(ctx,env){super(ctx,{HIMMAH_DATABASE_URL:'fake',HIMMAH_APP_ORIGIN:'https://himmah.test'},async()=>{},async()=>null);this.context=ctx;}async fetch(request){if(new URL(request.url).pathname==='/inspect')return Response.json({metadata:await this.context.storage.get('clock')??null,alarm:await this.context.storage.getAlarm()});return super.fetch(request);}}
 export default{async fetch(request,env){const stub=env.CLOCK.get(env.CLOCK.idFromName('himmah-notifications-v1'));if(new URL(request.url).pathname==='/inspect')return stub.fetch(request);
 const handler=createHandler({fetch:async()=>Response.json({user:{id:'owner',emailVerified:request.headers.get('x-unverified')!=='true'}}),store:()=>({get:async()=>({role:'owner'})}),activities:()=>({session:async()=>[{id:'${session}'}]}),attendance:()=>({canSession:async()=>[{allowed:true}],manage:async()=>{const s=await(await stub.fetch(new Request('https://clock/inspect'))).json();if(!s.metadata||Object.keys(s.metadata.leases).length!==1)throw Error('Mutation before durable intent');return[{result:{items:[{personId:'${person}',version:1,outcome:'saved'}]}}];}})});
 return handler(request,{HIMMAH_DATABASE_URL:'fake',HIMMAH_AUTH_URL:'https://auth.invalid',HIMMAH_APP_ORIGIN:'https://himmah.test',HIMMAH_PEOPLE_ENABLED:'true',HIMMAH_NOTIFICATION_ALARMS:'true',HIMMAH_NOTIFICATION_CLOCK:request.headers.get('x-clock-fail')==='true'?{idFromName:()=>'',get:()=>({fetch:async()=>new Response(null,{status:503})})}:env.CLOCK,ONBOARDING_LIMITER:{limit:async()=>({success:true})},DIRECTORY_LIMITER:{limit:async()=>({success:true})},ASSETS:{fetch:async()=>new Response('asset')}});}};`,
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
          name: "clock-api",
          modules: true,
          script: output.outputFiles[0].text,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
          durableObjects: {
            CLOCK: { className: "TestClock", useSQLite: true },
          },
        },
      ],
    }),
  );
  try {
    const url = `https://himmah.test/api/organizations/${org}/activities/${activity}/sessions/${session}/attendance`;
    const options = {
      method: "POST",
      headers: {
        origin: "https://himmah.test",
        "content-type": "application/json",
        cookie: "session=fixture",
      },
      body: JSON.stringify({
        key: crypto.randomUUID(),
        action: "add",
        items: [{ personId: person, version: 0 }],
      }),
    };
    assert.equal(
      (
        await mf.dispatchFetch(url, {
          ...options,
          headers: { ...options.headers, origin: "https://bad.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await mf.dispatchFetch(url, {
          ...options,
          headers: { ...options.headers, "x-unverified": "true" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await (await mf.dispatchFetch("https://himmah.test/inspect")).json())
        .metadata,
      null,
    );
    assert.equal(
      (
        await mf.dispatchFetch(url, {
          ...options,
          headers: { ...options.headers, "x-clock-fail": "true" },
        })
      ).status,
      503,
    );
    const response = await mf.dispatchFetch(url, options);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items[0].outcome, "saved");
    const inspected = await (
      await mf.dispatchFetch("https://himmah.test/inspect")
    ).json();
    assert.equal(Object.keys(inspected.metadata.leases).length, 0);
    assert.equal(inspected.metadata.revision, 2);
    assert.ok(inspected.alarm);
  } finally {
    await mf.dispose();
  }
});

test("retired scheduled entry point performs zero database or transport requests across 100 ticks", async () => {
  const output = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import entry from './src/server.ts';export default {async fetch(request,env){const pending=[];for(let i=0;i<100;i++)await entry.scheduled({},env,{waitUntil:p=>pending.push(p)});await Promise.all(pending);return env.PROBE.fetch('https://fixture/stats');}};`,
    },
    plugins: [
      {
        name: "framework-only-stubs",
        setup(b) {
          b.onResolve({ filter: /^@tanstack\/react-start\/server$/ }, () => ({
            path: "framework",
            namespace: "fixture",
          }));
          b.onResolve({ filter: /paraglide\/server\.js$/ }, () => ({
            path: "locale",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents:
              a.path === "framework"
                ? `export const createStartHandler=()=>()=>new Response('shell');export const defaultStreamHandler=()=>{};`
                : `export const paraglideMiddleware=(request,next)=>next();`,
            loader: "js",
          }));
        },
      },
    ],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2023",
    external: ["node:*", "cloudflare:*"],
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "legacy-cron",
          modules: true,
          script: output.outputFiles[0].text,
          compatibilityDate: "2026-10-18",
          compatibilityFlags: ["nodejs_compat"],
          bindings: {
            HIMMAH_DATABASE_URL:
              "postgresql://fixture:fixture@ep-synthetic.eu-central-1.aws.neon.tech/himmah",
            HIMMAH_PEOPLE_ENABLED: "true",
            HIMMAH_APP_ORIGIN: "https://himmah.test",
          },
          serviceBindings: { PROBE: "database-probe" },
          outboundService: "database-probe",
        },
        {
          name: "database-probe",
          modules: true,
          script: `let calls=0;export default{async fetch(r){if(new URL(r.url).pathname==='/stats')return Response.json({calls});calls++;return Response.json({message:'unexpected background database request'},{status:500});}};`,
        },
      ],
    }),
  );
  try {
    const response = await mf.dispatchFetch("https://test/ticks");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).calls, 0);
  } finally {
    await mf.dispose();
  }
});
