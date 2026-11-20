import test from "node:test";
import assert from "node:assert/strict";
import {
  NotificationClock,
  type ClockContext,
} from "../src/server/notification-clock.ts";
import {
  withNotificationWake,
  ensureNotificationClock,
} from "../src/server/notification-wake.ts";
import { runNotificationJobs } from "../src/server/notification-jobs.ts";

const env = {
  HIMMAH_DATABASE_URL: "unused",
  HIMMAH_APP_ORIGIN: "https://himmah.test",
  HIMMAH_PEOPLE_ENABLED: "true",
};
function fixture() {
  let time = Date.parse("2026-11-20T12:00:00Z"),
    alarmAt: number | null = null,
    work = 0,
    reads = 0,
    due: number | null = null,
    fail: unknown = null;
  const data = new Map<string, unknown>();
  let chain = Promise.resolve();
  const ctx: ClockContext = {
    storage: {
      get: async <T>(key: string) =>
        structuredClone(data.get(key)) as T | undefined,
      put: async (key, value) => {
        data.set(key, structuredClone(value));
      },
      setAlarm: async (at) => {
        alarmAt = at;
      },
      deleteAlarm: async () => {
        alarmAt = null;
      },
      transaction: async (fn) => fn(ctx.storage),
    },
    blockConcurrencyWhile: <T>(fn: () => Promise<T>) => {
      const next = chain.then(fn);
      chain = next.then(
        () => {},
        () => {},
      );
      return next;
    },
  };
  const clock = new NotificationClock(
    ctx,
    env,
    async () => {
      work++;
      if (fail) throw fail;
    },
    async () => {
      reads++;
      return due;
    },
    () => time,
  );
  const call = (path: string, body: unknown = {}) =>
    clock.fetch(
      new Request("https://clock" + path, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  return {
    clock,
    ctx,
    call,
    get work() {
      return work;
    },
    get reads() {
      return reads;
    },
    get alarm() {
      return alarmAt;
    },
    get now() {
      return time;
    },
    set due(n: number | null) {
      due = n;
    },
    set fail(value: unknown) {
      fail = value;
    },
    advance: (ms: number) => {
      time += ms;
    },
    namespace: {
      idFromName: () => "",
      get: () => ({ fetch: (r: Request) => clock.fetch(r) }),
    },
  };
}
test("empty clock discovers once and removes its alarm; page visits never poll PostgreSQL", async () => {
  const f = fixture();
  await f.call("/ensure");
  assert.equal(f.work, 0);
  assert.equal(f.alarm, f.now + 1000);
  await f.clock.alarm();
  assert.equal(f.work, 1);
  assert.equal(f.reads, 1);
  assert.equal(f.alarm, null);
  for (let i = 0; i < 100; i++) {
    await f.call("/ensure");
    await f.call("/bootstrap");
  }
  assert.equal(f.work, 1);
  assert.equal(f.reads, 1);
  assert.equal(f.alarm, null);
});
test("next actual deadline survives object recreation and concurrent invalidation is not overwritten", async () => {
  const f = fixture();
  f.due = f.now + 7 * 86400000;
  await f.call("/ensure");
  await f.clock.alarm();
  assert.equal(f.alarm, f.now + 7 * 86400000);
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const clock = new NotificationClock(
    f.ctx,
    env,
    () => waiting,
    async () => null,
    () => f.now,
  );
  const run = clock.alarm();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const token = crypto.randomUUID();
  await f.call("/begin", { token });
  await f.call("/finish", { token, ok: true });
  finish();
  await run;
  assert.equal(f.alarm, f.now + 1000);
  await f.clock.alarm();
  assert.equal(f.alarm, f.now + 7 * 86400000);
});
test("write intent is persisted before mutation, unfinished writes block scans and abandoned writes recover once", async () => {
  const f = fixture(),
    token = crypto.randomUUID();
  await f.call("/begin", { token });
  assert.equal(f.work, 0);
  assert.equal(f.alarm, f.now + 300000);
  await f.clock.alarm();
  assert.equal(f.work, 0);
  assert.equal(f.reads, 0);
  f.advance(300001);
  await f.clock.alarm();
  assert.equal(f.work, 1);
  assert.equal(f.alarm, null);
  const next = crypto.randomUUID();
  await f.call("/begin", { token: next });
  await f.call("/finish", { token: next, ok: false });
  assert.equal(f.alarm, f.now + 60000);
  await f.clock.alarm();
  assert.equal(f.work, 2);
});
test("quota opens a circuit until monthly reset; public visits cannot clear it, successful foreground work can", async () => {
  const f = fixture();
  f.fail = new Error(
    "NeonDbError Server error (HTTP status 402): exceeded the quota",
  );
  await f.call("/ensure");
  await f.clock.alarm();
  assert.equal(f.work, 1);
  assert.equal(f.alarm, Date.parse("2026-12-01T00:00:00Z"));
  for (let i = 0; i < 50; i++) {
    await f.call("/ensure");
    await f.clock.alarm();
  }
  assert.equal(f.work, 1);
  f.fail = null;
  await f.call("/bootstrap");
  assert.equal(f.alarm, f.now + 1000);
  await f.clock.alarm();
  assert.equal(f.work, 2);
  assert.equal(f.alarm, null);
});
test("non-quota failures back off sparsely and eventually stop, without automatic platform hot retries", async () => {
  const f = fixture();
  f.fail = new Error("network unavailable");
  await f.call("/ensure");
  for (const delay of [15 * 60000, 3600000, 6 * 3600000, 24 * 3600000]) {
    await f.clock.alarm();
    assert.equal(f.alarm, f.now + delay);
    f.advance(delay);
  }
  await f.clock.alarm();
  assert.equal(f.work, 5);
  assert.equal(f.alarm, null);
  await f.call("/ensure");
  assert.equal(f.alarm, null);
});
test("scheduler middleware guards writes, retains unknown outcomes and never primes auth/public APIs", async () => {
  const f = fixture(),
    request = new Request(
      "https://himmah.test/api/organizations/test/activities",
      { method: "POST" },
    ),
    bindings = {
      HIMMAH_NOTIFICATION_ALARMS: "true",
      HIMMAH_NOTIFICATION_CLOCK: f.namespace,
    };
  let writes = 0;
  const response = await withNotificationWake(request, bindings, async () => {
    assert.ok(f.alarm);
    writes++;
    return Response.json({ saved: true });
  });
  assert.equal(response.status, 200);
  assert.equal(writes, 1);
  assert.equal(f.work, 0);
  assert.equal(f.alarm, f.now + 1000);
  await f.clock.alarm();
  assert.equal(f.work, 1);
  await assert.rejects(
    () =>
      withNotificationWake(request, bindings, async () => {
        throw Error("uncertain");
      }),
    /uncertain/,
  );
  assert.equal(f.alarm, f.now + 60000);
  const denied = await withNotificationWake(
    request,
    { HIMMAH_NOTIFICATION_ALARMS: "true" },
    async () => {
      writes++;
      return Response.json({});
    },
  );
  assert.equal(denied.status, 503);
  assert.equal(writes, 1);
  await withNotificationWake(
    new Request("https://himmah.test/api/auth/get-session"),
    bindings,
    async () => Response.json({}),
  );
  assert.equal(f.work, 1);
  await ensureNotificationClock(bindings);
  assert.equal(f.work, 1);
});
test("generation quota fails once without further delivery queries; other generator failures preserve delivery then surface for backoff", async () => {
  let delivered = 0;
  await assert.rejects(
    () =>
      runNotificationJobs(env, {
        generate: async () => {
          throw Error("quota exceeded");
        },
        deliver: async () => {
          delivered++;
        },
      }),
    /quota/,
  );
  assert.equal(delivered, 0);
  await assert.rejects(
    () =>
      runNotificationJobs(env, {
        generate: async () => {
          throw Error("generator broke");
        },
        deliver: async () => {
          delivered++;
        },
      }),
    /generator broke/,
  );
  assert.equal(delivered, 1);
});
