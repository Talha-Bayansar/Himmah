import { createSessionFollowStore } from "./session-follow-store.ts";
import { deliverPush, type PushEnv } from "./push-delivery.ts";
export async function runNotificationJobs(
  env: PushEnv & {
    HIMMAH_PEOPLE_ENABLED?: string;
    HIMMAH_MAINTENANCE?: string;
  },
  dependencies: {
    generate?: () => Promise<unknown>;
    deliver?: () => Promise<unknown>;
  } = {},
) {
  if (env.HIMMAH_MAINTENANCE === "true" || !env.HIMMAH_DATABASE_URL) return;
  if (env.HIMMAH_PEOPLE_ENABLED === "true") {
    try {
      await (
        dependencies.generate ??
        (() => createSessionFollowStore(env.HIMMAH_DATABASE_URL).generate())
      )();
    } catch {
      console.error("session-reminder-generation-failed");
    } // Never log database credentials or private records.
  }
  await (dependencies.deliver ?? (() => deliverPush(env)))();
}
