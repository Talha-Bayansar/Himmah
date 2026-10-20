import { m } from "../paraglide/messages.js";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import {
  createNotificationStore,
  type NotificationStore,
} from "./notification-store.ts";
import { pushEndpoint } from "../notifications/contracts.ts";
export type PushEnv = {
  HIMMAH_DATABASE_URL: string;
  HIMMAH_APP_ORIGIN: string;
  HIMMAH_VAPID_PUBLIC_KEY?: string;
  HIMMAH_VAPID_PRIVATE_KEY?: string;
};
export async function deliverPush(
  env: PushEnv,
  options: { store?: NotificationStore; fetch?: typeof fetch } = {},
) {
  if (
    !env.HIMMAH_VAPID_PUBLIC_KEY ||
    !env.HIMMAH_VAPID_PRIVATE_KEY ||
    !env.HIMMAH_DATABASE_URL
  )
    return;
  const store =
      options.store ?? createNotificationStore(env.HIMMAH_DATABASE_URL),
    send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const jobs = await store.claim();
  // Bounded batches keep scheduled Workers within subrequest limits.
  for (let i = 0; i < jobs.length; i += 4)
    await Promise.all(
      jobs.slice(i, i + 4).map(async (job) => {
        const id = String(job.id),
          lease = String(job.lease),
          attempts = Number(job.attempts);
        let state = "dead",
          delay = 0;
        try {
          const target = (await store.target(id, lease))[0];
          if (!target) {
            await store.finish(id, lease, "dead", 0);
            return;
          }
          const body = m.push_alert(
            {},
            {
              locale:
                target.locale === "nl"
                  ? "nl"
                  : target.locale === "tr"
                    ? "tr"
                    : "en",
            },
          );
          const payload = JSON.stringify({
            title: "Himmah",
            body,
            url: `/workspace/${target.organizationId}/notifications`,
          });
          const endpoint = pushEndpoint(target.endpoint);
          const request = await buildPushPayload(
            { data: payload, options: { ttl: 3600, urgency: "normal" } },
            {
              endpoint,
              expirationTime: null,
              keys: {
                p256dh: String(target.p256dh),
                auth: String(target.auth),
              },
            },
            {
              subject: env.HIMMAH_APP_ORIGIN,
              publicKey: env.HIMMAH_VAPID_PUBLIC_KEY!,
              privateKey: env.HIMMAH_VAPID_PRIVATE_KEY!,
            },
          );
          const response = await send(endpoint, {
            ...request,
            redirect: "manual",
            signal: AbortSignal.timeout(10000),
          });
          if (response.ok) state = "sent";
          else if ([404, 410].includes(response.status)) {
            await store.expired(String(target.deviceId));
            return;
          } else if (
            response.status === 429 ||
            response.status >= 500 ||
            [401, 403].includes(response.status)
          ) {
            state = attempts >= 5 ? "dead" : "pending";
            const retry = Number(response.headers.get("Retry-After"));
            delay = Math.min(
              3600,
              Math.max(
                60,
                Number.isFinite(retry) ? retry : 0,
                30 * 2 ** attempts,
              ),
            );
          }
          await response.body?.cancel();
        } catch {
          state = attempts >= 5 ? "dead" : "pending";
          delay = Math.min(3600, 30 * 2 ** attempts);
        }
        await store.finish(id, lease, state, delay);
      }),
    );
}
