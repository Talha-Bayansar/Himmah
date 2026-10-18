import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createHandler, type Env } from "./server/worker";
const render = createStartHandler(defaultStreamHandler);
const api = createHandler();
export default {
  async fetch(request: Request) {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return api(request, env as unknown as Env);
    return render(request);
  },
};
