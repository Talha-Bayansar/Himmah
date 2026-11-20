import { isQuotaError } from "./notification-failure.ts";
import { createNotificationScheduleStore } from "./notification-schedule-store.ts";
import { runNotificationJobs } from "./notification-jobs.ts";
import type { PushEnv } from "./push-delivery.ts";

export interface ClockTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
export interface ClockStorage extends ClockTransaction {
  transaction<T>(fn: (storage: ClockTransaction) => Promise<T>): Promise<T>;
}
export interface ClockContext {
  storage: ClockStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}
export type ClockEnv = PushEnv & {
  HIMMAH_PEOPLE_ENABLED?: string;
  HIMMAH_MAINTENANCE?: string;
};
type ClockData = {
  revision: number;
  initialized: boolean;
  dirty: boolean;
  leases: Record<string, number>;
  failures: number;
  blockedUntil: number | null;
  quota: boolean;
};
const initial = (): ClockData => ({
  revision: 0,
  initialized: false,
  dirty: false,
  leases: {},
  failures: 0,
  blockedUntil: null,
  quota: false,
});
const LEASE = 5 * 60_000;
/** SQLite-backed Durable Object: one timestamp and write leases, never a polling interval. */
export class NotificationClock {
  private ctx: ClockContext;
  private env: ClockEnv;
  private work: () => Promise<unknown>;
  private next: () => Promise<number | null>;
  private now: () => number;
  constructor(
    ctx: ClockContext,
    env: ClockEnv,
    work: () => Promise<unknown> = () => runNotificationJobs(env),
    next: () => Promise<number | null> = () =>
      createNotificationScheduleStore(env.HIMMAH_DATABASE_URL).next(
        !!env.HIMMAH_VAPID_PUBLIC_KEY && !!env.HIMMAH_VAPID_PRIVATE_KEY,
        env.HIMMAH_PEOPLE_ENABLED === "true",
      ),
    now = () => Date.now(),
  ) {
    this.ctx = ctx;
    this.env = env;
    this.work = work;
    this.next = next;
    this.now = now;
  }
  private async read() {
    return (await this.ctx.storage.get<ClockData>("clock")) ?? initial();
  }
  private async save(state: ClockData, at: number | null) {
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put("clock", state);
      if (at === null) await storage.deleteAlarm();
      else await storage.setAlarm(at);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (
      request.method !== "POST" ||
      !["/begin", "/finish", "/bootstrap", "/ensure"].includes(path)
    )
      return new Response(null, { status: 404 });
    const text = await request.text();
    if (text.length > 256) return new Response(null, { status: 400 });
    let body: { token?: string; ok?: boolean };
    try {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      return new Response(null, { status: 400 });
    }
    if (
      !["/bootstrap", "/ensure"].includes(path) &&
      (typeof body.token !== "string" || !/^[0-9a-f-]{36}$/.test(body.token))
    )
      return new Response(null, { status: 400 });
    return this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.read(),
        now = this.now();
      if (path === "/ensure") {
        // One initial discovery after rollout. Public page visits cannot reset failure/quota backoff.
        if (
          !state.initialized &&
          !state.dirty &&
          state.failures === 0 &&
          !state.blockedUntil
        ) {
          state.dirty = true;
          state.revision++;
          await this.save(state, now + 1000);
        }
        return new Response(null, { status: 204 });
      }
      if (path === "/begin") {
        if (Object.keys(state.leases).length >= 128)
          return new Response(null, { status: 503 });
        state.leases[body.token!] = now + LEASE;
        state.revision++;
        state.dirty = true;
        // Atomically persist write intent and safety alarm before PostgreSQL may be touched.
        await this.save(state, Math.min(...Object.values(state.leases)));
      } else if (path === "/finish") {
        if (!state.leases[body.token!])
          return new Response(null, { status: 409 });
        delete state.leases[body.token!];
        state.revision++;
        state.dirty = true;
        if (body.ok === true) {
          state.quota = false;
          state.blockedUntil = null;
          state.failures = 0;
        }
        const active = Object.values(state.leases).filter((at) => at > now);
        const at = active.length
          ? Math.min(...active)
          : body.ok === true
            ? now + 1000
            : now + 60_000;
        await this.save(state, Math.max(at, state.blockedUntil ?? 0));
      } else if (
        !state.initialized ||
        state.quota ||
        (state.failures > 0 && !state.dirty)
      ) {
        if (state.dirty && !state.quota)
          return new Response(null, { status: 204 });
        // Only called after successful authenticated foreground database work.
        state.quota = false;
        state.blockedUntil = null;
        state.failures = 0;
        state.dirty = true;
        state.revision++;
        await this.save(state, now + 1000);
      }
      return new Response(null, { status: 204 });
    });
  }
  async alarm(): Promise<void> {
    const snapshot = await this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.read(),
        now = this.now();
      if (
        this.env.HIMMAH_MAINTENANCE === "true" ||
        !this.env.HIMMAH_DATABASE_URL
      ) {
        state.dirty = false;
        state.initialized = false;
        await this.save(state, null);
        return null;
      }
      if (state.blockedUntil && state.blockedUntil > now) {
        await this.ctx.storage.setAlarm(state.blockedUntil);
        return null;
      }
      const active = Object.values(state.leases).filter((at) => at > now);
      if (active.length) {
        await this.ctx.storage.setAlarm(Math.min(...active));
        return null;
      }
      state.leases = {};
      await this.ctx.storage.put("clock", state);
      return state.revision;
    });
    if (snapshot === null) return;
    try {
      await this.work();
      const due = await this.next();
      await this.ctx.blockConcurrencyWhile(async () => {
        const state = await this.read(),
          now = this.now();
        state.initialized = true;
        state.failures = 0;
        state.quota = false;
        state.blockedUntil = null;
        if (state.revision !== snapshot) {
          state.dirty = true;
          await this.save(state, now + 1000);
          return;
        }
        state.dirty = false;
        await this.save(
          state,
          due === null ? null : Math.max(now + 10_000, due),
        );
      });
    } catch (error) {
      await this.ctx.blockConcurrencyWhile(async () => {
        const state = await this.read(),
          now = this.now();
        if (state.revision !== snapshot) {
          state.dirty = true;
          await this.save(state, now + 1000);
          return;
        }
        state.failures++;
        state.quota = isQuotaError(error);
        state.blockedUntil = state.quota
          ? Date.UTC(
              new Date(now).getUTCFullYear(),
              new Date(now).getUTCMonth() + 1,
              1,
            )
          : now +
            [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000][
              Math.min(state.failures - 1, 3)
            ]!;
        // Quota: one monthly recovery alarm; other failures: bounded sparse retries, then foreground recovery.
        state.dirty = false;
        await this.save(
          state,
          !state.quota && state.failures >= 5 ? null : state.blockedUntil,
        );
      });
      console.error("notification-alarm-deferred"); // Never log private rows, connection strings or provider errors.
    }
  }
}
