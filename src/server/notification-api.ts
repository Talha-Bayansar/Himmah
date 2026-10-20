import {
  CommunityError,
  uuid,
  pageInput,
  pageResult,
} from "../community/contracts.ts";
import { pushInput, pushEndpoint } from "../notifications/contracts.ts";
import type { OrganizationStore } from "./store.ts";
import type { NotificationStore } from "./notification-store.ts";
export async function notificationApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: NotificationStore,
  publicKey: string | null,
) {
  const url = new URL(request.url),
    orgMatch = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/notifications(?:\/(unread|read|[0-9a-f-]{36}))?$/i,
    ),
    pushMatch = url.pathname.match(
      /^\/api\/notifications\/push(?:\/(status|all))?$/,
    );
  if (!orgMatch && !pushMatch) return null;
  const respond = (v: unknown, status = 200) =>
    Response.json(v, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  try {
    if (!user.emailVerified && !(pushMatch && request.method === "DELETE"))
      throw new CommunityError("verify_required", 403);
    let org: string | undefined;
    if (orgMatch) {
      org = uuid(orgMatch[1]);
      if (!(await organizations.get(user.id, org)))
        throw new CommunityError("not_found", 404);
    }
    if (request.method === "GET") {
      if (pushMatch)
        return pushMatch[1]
          ? respond({ code: "not_found" }, 404)
          : respond({ publicKey });
      if (orgMatch![2] === "unread")
        return respond({
          count: Number((await store.unread(user.id, org!))[0]?.count ?? 0),
        });
      if (orgMatch![2]) return respond({ code: "not_found" }, 404);
      const p = pageInput(url, `${user.id}:${org}/notifications`);
      if (p.query || p.archived || p.groupId)
        throw new CommunityError("invalid_input");
      return respond(
        pageResult(
          (await store.list(user.id, org!, p)) as {
            id: string;
            createdAt: string;
          }[],
          p,
        ),
      );
    }
    if (!["POST", "DELETE"].includes(request.method))
      return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 5000) throw new CommunityError("invalid_input");
    let b: Record<string, unknown>;
    try {
      b = JSON.parse(text);
      if (!b || Array.isArray(b) || typeof b !== "object") throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    if (pushMatch) {
      if (pushMatch[1] === "status" && request.method === "POST")
        return respond({
          enabled: !!(await store.device(user.id, pushEndpoint(b.endpoint)))[0],
        });
      if (request.method === "DELETE") {
        await store.remove(
          user.id,
          pushMatch[1] === "all" ? null : pushEndpoint(b.endpoint),
        );
        return respond({ ok: true });
      }
      if (pushMatch[1]) return respond({ code: "not_found" }, 404);
      if (!publicKey) throw new CommunityError("service", 503);
      const input = pushInput(b);
      try {
        const raw = Uint8Array.from(
          atob(input.p256dh.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        );
        await crypto.subtle.importKey(
          "raw",
          raw,
          { name: "ECDH", namedCurve: "P-256" },
          false,
          [],
        );
      } catch {
        throw new CommunityError("invalid_input");
      }
      const result = await store.register(user.id, input);
      if (!result[0]?.ok) throw new CommunityError("push_conflict", 409);
      return respond({ ok: true });
    }
    if (request.method !== "POST" || !orgMatch![2])
      return respond({ code: "not_found" }, 404);
    await store.read(
      user.id,
      org!,
      orgMatch![2] === "read" ? null : uuid(orgMatch![2]),
    );
    return respond({ ok: true });
  } catch (e) {
    return e instanceof CommunityError
      ? respond({ code: e.code }, e.status)
      : respond({ code: "service" }, 503);
  }
}
