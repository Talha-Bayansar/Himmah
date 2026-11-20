export interface NotificationClockNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface NotificationWakeEnv {
  HIMMAH_NOTIFICATION_ALARMS?: string;
  HIMMAH_NOTIFICATION_CLOCK?: NotificationClockNamespace;
}
const unavailable = () =>
  Response.json(
    { code: "service" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
export async function withNotificationWake(
  request: Request,
  env: NotificationWakeEnv,
  run: () => Promise<Response>,
): Promise<Response> {
  if (env.HIMMAH_NOTIFICATION_ALARMS !== "true") return run();
  const path = new URL(request.url).pathname;
  if (!/^\/api\/(organizations(?:\/|$)|notifications(?:\/|$))/.test(path))
    return run();
  const namespace = env.HIMMAH_NOTIFICATION_CLOCK;
  const mutating = !["GET", "HEAD"].includes(request.method);
  if (!namespace) return mutating ? unavailable() : run();
  const stub = namespace.get(namespace.idFromName("himmah-notifications-v1"));
  const call = (path: string, body: unknown) =>
    stub.fetch(
      new Request("https://notification-clock" + path, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  if (!mutating) {
    const response = await run();
    if (response.ok) {
      try {
        await call("/bootstrap", {});
      } catch {
        console.error("notification-clock-bootstrap-unavailable");
      }
    }
    return response;
  }
  const token = crypto.randomUUID();
  try {
    if (!(await call("/begin", { token })).ok) return unavailable();
  } catch {
    return unavailable();
  }
  let response: Response;
  try {
    response = await run();
  } catch (error) {
    try {
      await call("/finish", { token, ok: false });
    } catch {}
    throw error;
  }
  try {
    if (!(await call("/finish", { token, ok: response.ok })).ok && response.ok)
      return unavailable();
  } catch {
    if (response.ok) return unavailable();
  }
  return response;
}

/** Public HTML may initialize an empty clock once, but cannot wake an initialized/blocked database. */
export async function ensureNotificationClock(
  env: NotificationWakeEnv,
): Promise<void> {
  if (
    env.HIMMAH_NOTIFICATION_ALARMS !== "true" ||
    !env.HIMMAH_NOTIFICATION_CLOCK
  )
    return;
  const namespace = env.HIMMAH_NOTIFICATION_CLOCK;
  try {
    await namespace.get(namespace.idFromName("himmah-notifications-v1")).fetch(
      new Request("https://notification-clock/ensure", {
        method: "POST",
        body: "{}",
      }),
    );
  } catch {
    console.error("notification-clock-initialization-unavailable");
  }
}
