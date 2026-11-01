import {
  CommunityError,
  pageInput,
  pageResult,
  uuid,
  versionInput,
} from "../community/contracts.ts";
import { staffInput, tokenInput, hashToken } from "../learning/contracts.ts";
import type { LearningStore } from "./learning-store.ts";
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
  const r = rows[0]?.result as Record<string, unknown>;
  if (!r) throw new CommunityError("not_found", 404);
  if (r.error)
    throw new CommunityError(
      String(r.error),
      r.error === "forbidden"
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
  if (text.length > 256000) throw new CommunityError("invalid_input");
  try {
    const b = JSON.parse(text);
    if (!b || typeof b !== "object" || Array.isArray(b)) throw Error();
    return b as Record<string, unknown>;
  } catch {
    throw new CommunityError("invalid_input");
  }
}
export async function learningApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: LearningStore,
) {
  const url = new URL(request.url),
    history = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/learning\/contacts\/([0-9a-f-]{36})$/i,
    ),
    m = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/learning(?:\/([0-9a-f-]{36}|options))?(?:\/(participants|results)(?:\/([0-9a-f-]{36}))?)?$/i,
    );
  if (!m && !history) return null;
  try {
    const org = uuid((history ?? m)![1]);
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    const membership = await organizations.get(user.id, org);
    if (!membership) throw new CommunityError("not_found", 404);
    if (!["owner", "admin"].includes(membership.role))
      throw new CommunityError("forbidden", 403);
    if (history) {
      if (request.method !== "GET") throw new CommunityError("not_found", 404);
      const contact = uuid(history[2]),
        p = pageInput(url, `${user.id}:${org}/learning/contacts/${contact}`);
      if (p.archived || p.groupId) throw new CommunityError("invalid_input");
      const data = await store.contactHistory(user.id, org, contact, p);
      if (!data) throw new CommunityError("not_found", 404);
      return response({ ...pageResult(data.items, p), total: data.total });
    }
    if (!m) return null;
    const id = m[2] && m[2] !== "options" ? uuid(m[2]) : null;
    if (request.method === "GET") {
      const scope =
        user.id +
        ":" +
        org +
        "/learning/" +
        (id ?? "list") +
        "/" +
        (m[3] ?? "") +
        "/" +
        url.searchParams.get("publication") +
        "/" +
        url.searchParams.get("kind") +
        "/" +
        url.searchParams.get("activity") +
        "/" +
        url.searchParams.get("session");
      const p = pageInput(url, scope);
      if (p.archived || p.groupId) throw new CommunityError("invalid_input");
      if (m[2] === "options") {
        const kind = url.searchParams.get("kind") ?? "contacts";
        if (!["contacts", "activities", "sessions"].includes(kind))
          throw new CommunityError("invalid_input");
        return response(
          pageResult(
            (await store.options(user.id, org, p, kind)) as {
              id: string;
              createdAt: string;
            }[],
            p,
          ),
        );
      }
      if (!id)
        return response(
          pageResult(
            (await store.list(
              user.id,
              org,
              p,
              url.searchParams.get("activity")
                ? uuid(url.searchParams.get("activity"))
                : null,
              url.searchParams.get("session")
                ? uuid(url.searchParams.get("session"))
                : null,
            )) as { id: string; createdAt: string }[],
            p,
          ),
        );
      if (m[3] === "results" && m[4]) {
        const items = await store.result(user.id, org, id, uuid(m[4]));
        if (!items[0]) throw new CommunityError("not_found", 404);
        return response(items[0]);
      }
      if (m[3]) {
        return response(
          pageResult(
            (await store.participants(
              user.id,
              org,
              id,
              uuid(url.searchParams.get("publication")),
              p,
              m[3] === "results",
            )) as { id: string; createdAt: string }[],
            p,
          ),
        );
      }
      const detail = await store.detail(
        user.id,
        org,
        id,
        url.searchParams.get("publication")
          ? uuid(url.searchParams.get("publication"))
          : null,
      );
      if (!detail) throw new CommunityError("not_found", 404);
      return response(detail);
    }
    if (request.method !== "POST" || !id || m[3])
      throw new CommunityError("not_found", 404);
    const input = staffInput(await body(request));
    const payload = { ...input.payload };
    if (payload.token) {
      payload.hash = await hashToken(payload.token as string);
      delete payload.token;
    }
    if (payload.recipients)
      payload.recipients = await Promise.all(
        (payload.recipients as { contact: string; token: string }[]).map(
          async (r) => ({ contact: r.contact, hash: await hashToken(r.token) }),
        ),
      );
    return response(
      result(await store.command(user.id, org, id, input.key, payload)),
    );
  } catch (e) {
    if (e instanceof CommunityError)
      return response({ code: e.code }, e.status);
    throw e;
  }
}
const cookie = (request: Request, name: string) => {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : "";
};
export async function learningRateKey(request: Request) {
  return hashToken(
    cookie(request, "hl_resume") ||
      cookie(request, "hl_access") ||
      request.headers.get("cf-connecting-ip") ||
      "local",
  );
}
export async function learningPublicApi(
  request: Request,
  store: LearningStore,
) {
  const m = new URL(request.url).pathname.match(
    /^\/api\/learning\/public\/([0-9a-f-]{36})(?:\/(access|command))?$/i,
  );
  if (!m) return null;
  try {
    const item = uuid(m[1]),
      raw = cookie(request, "hl_access"),
      resume = cookie(request, "hl_resume");
    const credential = raw ? await hashToken(raw) : "",
      resumeHash = resume ? await hashToken(resume) : "";
    const setCookie = (name: string, value: string) =>
      `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api/learning/public/${item}; Max-Age=2592000`;
    if (request.method === "GET" && !m[2])
      return response(result(await store.public(item, credential, resumeHash)));
    if (request.method !== "POST") throw new CommunityError("not_found", 404);
    const b = await body(request);
    if (m[2] === "access") {
      const token = tokenInput(b.token);
      result(await store.public(item, await hashToken(token), resumeHash));
      return response({ ok: true }, 200, {
        "Set-Cookie": setCookie("hl_access", token),
      });
    }
    if (m[2] !== "command") throw new CommunityError("not_found", 404);
    const key = uuid(b.key),
      action = b.action;
    let p: Record<string, unknown> = { action };
    if (action === "start") {
      p.name = typeof b.name === "string" ? b.name.trim() : "";
      if (
        (p.name as string).length > 80 ||
        /[\u0000-\u001f]/.test(p.name as string)
      )
        throw new CommunityError("invalid_input");
      p.guestHash = await hashToken(tokenInput(b.guestToken));
    } else if (action === "answer" || action === "submit") {
      p.attempt = uuid(b.attempt);
      p.revision = versionInput({ version: b.revision });
      if (action === "answer") {
        if (
          !Number.isInteger(b.question) ||
          Number(b.question) < 0 ||
          Number(b.question) > 49 ||
          !Number.isInteger(b.choice) ||
          Number(b.choice) < 0 ||
          Number(b.choice) > 5
        )
          throw new CommunityError("invalid_input");
        p.question = b.question;
        p.choice = b.choice;
      }
    } else throw new CommunityError("invalid_input");
    const out = result(
      await store.participate(item, credential, resumeHash, key, p),
    );
    return response(
      out,
      200,
      action === "start" && out.guestStarted
        ? { "Set-Cookie": setCookie("hl_resume", b.guestToken as string) }
        : {},
    );
  } catch (e) {
    if (e instanceof CommunityError)
      return response({ code: e.code }, e.status);
    throw e;
  }
}
