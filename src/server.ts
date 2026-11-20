import { ensureNotificationClock } from "./server/notification-wake";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { paraglideMiddleware } from "./paraglide/server.js";
export { NotificationClock } from "./server/notification-clock";
import { createHandler, type Env } from "./server/worker";
const render = createStartHandler(defaultStreamHandler);
const api = createHandler();
export default {
  // Ignore any delayed invocations of the retired cron. Never touch Neon here.
  async scheduled() {},
  async fetch(request: Request) {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return api(request, env as unknown as Env);
    if (
      (env as unknown as Env).HIMMAH_MAINTENANCE !== "true" &&
      request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html")
    )
      await ensureNotificationClock(env as unknown as Env);
    return paraglideMiddleware(request, () => render(request));
  },
};
