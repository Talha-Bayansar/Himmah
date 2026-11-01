import {
  CommunityError,
  uuid,
  pageInput,
  pageResult,
} from "../community/contracts.ts";
import { hashToken, tokenInput } from "../learning/contracts.ts";
import { codeInput, hostInput, answerInput } from "../live/contracts.ts";
import type { LiveStore } from "./live-store.ts";
import type { OrganizationStore } from "./store.ts";
const response = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
const result = (rows: Record<string, unknown>[]) => {
  const r = rows[0]?.result as Record<string, unknown> | undefined;
  if (!r) throw new CommunityError("not_found", 404);
  if (r.error)
    throw new CommunityError(
      String(r.error),
      ["forbidden", "live_revoked"].includes(String(r.error))
        ? 403
        : r.error === "not_found"
          ? 404
          : r.error === "conflict"
            ? 409
            : 400,
    );
  return r;
};
async function body(request: Request) {
  const text = await request.text();
  if (text.length > 16000) throw new CommunityError("invalid_input");
  try {
    const b = JSON.parse(text);
    if (!b || typeof b !== "object" || Array.isArray(b)) throw Error();
    return b as Record<string, unknown>;
  } catch {
    throw new CommunityError("invalid_input");
  }
}
const cookie = (request: Request) =>
  request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("hl_live="))
    ?.slice(8) ?? "";
const credential = async (request: Request) => {
  const raw = cookie(request);
  if (!raw) return "";
  try {
    return await hashToken(tokenInput(raw));
  } catch {
    throw new CommunityError("live_revoked", 403);
  }
};
export async function liveRateKey(request: Request, join = false) {
  const input =
    (!join && cookie(request)) ||
    request.headers.get("CF-Connecting-IP") ||
    "unknown";
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function livePublicApi(request: Request, store: LiveStore) {
  const m = new URL(request.url).pathname.match(
    /^\/api\/live\/rooms\/([A-F0-9]{10})(?:\/(join|answer))?$/,
  );
  if (!m) return null;
  try {
    const code = codeInput(m[1]);
    if (request.method === "GET" && !m[2])
      return response(
        result(await store.public(code, await credential(request))),
      );
    if (request.method !== "POST" || !m[2])
      throw new CommunityError("not_found", 404);
    const b = await body(request),
      key = uuid(b.key);
    if (m[2] === "join") {
      const token = tokenInput(b.token),
        nickname = typeof b.nickname === "string" ? b.nickname.trim() : "";
      if (nickname.length > 40 || /[\u0000-\u001f\u007f]/.test(nickname))
        throw new CommunityError("invalid_input");
      const out = result(
        await store.guest(code, await hashToken(token), key, {
          action: "join",
          nickname,
        }),
      );
      return response(out, 200, {
        "Set-Cookie": `hl_live=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/live/rooms/${code}; Max-Age=43200`,
      });
    }
    const hash = await credential(request);
    if (!hash) throw new CommunityError("not_found", 404);
    return response(result(await store.guest(code, hash, key, answerInput(b))));
  } catch (e) {
    if (e instanceof CommunityError)
      return response({ code: e.code }, e.status);
    throw e;
  }
}
export async function liveStaffApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: LiveStore,
) {
  const u = new URL(request.url),
    m = u.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/learning\/([0-9a-f-]{36})\/live(?:\/([0-9a-f-]{36})(?:\/(players))?)?$/i,
    );
  if (!m) return null;
  try {
    const org = uuid(m[1]),
      item = uuid(m[2]),
      room = m[3] ? uuid(m[3]) : null;
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    const membership = await organizations.get(user.id, org);
    if (!membership) throw new CommunityError("not_found", 404);
    if (!["owner", "admin"].includes(membership.role))
      throw new CommunityError("forbidden", 403);
    if (request.method === "GET") {
      if (room && !m[4])
        return response(result(await store.read(user.id, org, item, room)));
      const p = pageInput(
        u,
        `${user.id}:${org}/learning/${item}/live/${room ?? "list"}/${m[4] ?? ""}`,
      );
      if (p.archived || p.groupId || (!room && p.query))
        throw new CommunityError("invalid_input");
      if (room) result(await store.read(user.id, org, item, room));
      return response(
        pageResult(
          (room
            ? await store.players(user.id, org, item, room, p)
            : await store.list(user.id, org, item, p)) as {
            id: string;
            createdAt: string;
          }[],
          p,
        ),
      );
    }
    if (request.method !== "POST" || m[4])
      throw new CommunityError("not_found", 404);
    const input = hostInput(await body(request), room);
    return response(
      result(
        await store.host(
          user.id,
          org,
          item,
          input.id,
          input.key,
          input.payload,
        ),
      ),
    );
  } catch (e) {
    if (e instanceof CommunityError)
      return response({ code: e.code }, e.status);
    throw e;
  }
}
