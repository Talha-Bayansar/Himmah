import { deliverPush } from "./server/push-delivery";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { paraglideMiddleware } from "./paraglide/server.js";
import { env } from "cloudflare:workers";
import { createHandler, type Env } from "./server/worker";
const render = createStartHandler(defaultStreamHandler);
const api = createHandler();
export default {
  async scheduled(
    _event: unknown,
    bindings: Env,
    context: { waitUntil(promise: Promise<unknown>): void },
  ) {
    context.waitUntil(deliverPush(bindings));
  },
  async fetch(request: Request) {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return api(request, env as unknown as Env);
    return paraglideMiddleware(request, () => render(request));
  },
};
