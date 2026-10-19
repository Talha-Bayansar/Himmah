import {
  CommunityError,
  uuid,
  pageInput,
  pageResult,
  versionInput,
} from "../community/contracts.ts";
import { challengeInput, challengeNote } from "../challenges/contracts.ts";
import type { OrganizationStore } from "./store.ts";
import type { ChallengeStore } from "./challenge-store.ts";
export async function challengeApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: ChallengeStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/(me\/)?challenges(?:\/([0-9a-f-]{36})(?:\/(submissions|candidates)(?:\/([0-9a-f-]{36}))?)?)?$/i,
    );
  if (!match) return null;
  const respond = (v: unknown, status = 200) =>
    Response.json(v, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  const result = (rows: Record<string, unknown>[]) => {
    const r = rows[0]?.result as { id: string; code?: string } | undefined;
    if (!r) throw new CommunityError("service", 503);
    if (r.code)
      throw new CommunityError(
        r.code,
        r.code === "forbidden"
          ? 403
          : r.code === "not_found"
            ? 404
            : r.code === "invalid_input"
              ? 400
              : 409,
      );
    return r;
  };
  try {
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    const org = uuid(match[1]),
      self = !!match[2],
      id = match[3] ? uuid(match[3]) : null,
      kind = match[4],
      sid = match[5] ? uuid(match[5]) : null;
    const member = await organizations.get(user.id, org);
    if (!member) throw new CommunityError("not_found", 404);
    if (
      self
        ? member.role !== "participant"
        : !["owner", "admin"].includes(member.role)
    )
      throw new CommunityError("forbidden", 403);
    if (self && !(await store.access(user.id, org))[0])
      throw new CommunityError("forbidden", 403);
    const challenge = id ? (await store.get(user.id, org, id, self))[0] : null;
    if (id && !challenge) throw new CommunityError("not_found", 404);
    if (request.method === "GET") {
      if (kind === "submissions" && self)
        throw new CommunityError("forbidden", 403);
      if (sid) {
        if (kind !== "submissions") throw new CommunityError("invalid_input");
        const item = (await store.submission(user.id, org, id!, sid))[0];
        if (!item) throw new CommunityError("not_found", 404);
        return respond({ item });
      }
      if (id && !kind) return respond({ item: challenge });
      if (kind === "candidates" && self)
        throw new CommunityError("forbidden", 403);
      const view =
          url.searchParams.get("view") ?? (self ? "available" : "published"),
        status = url.searchParams.get("status") ?? "pending";
      if (
        !id &&
        !(
          self ? ["available", "history"] : ["draft", "published", "archived"]
        ).includes(view)
      )
        throw new CommunityError("invalid_input");
      if (kind === "submissions" && !["pending", "all"].includes(status))
        throw new CommunityError("invalid_input");
      const p = pageInput(
        url,
        `${user.id}:${org}/challenges/${self}/${id ?? "list"}/${kind ?? view}/${status}`,
      );
      if (p.archived || p.groupId) throw new CommunityError("invalid_input");
      const items =
        kind === "submissions"
          ? await store.submissions(user.id, org, id!, p, status)
          : kind === "candidates"
            ? await store.candidates(user.id, org, id!, p)
            : await store.list(user.id, org, p, self, view);
      return respond(
        pageResult(items as { id: string; createdAt: string }[], p),
      );
    }
    if (!["POST", "PATCH"].includes(request.method) || kind === "candidates")
      return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 12000) throw new CommunityError("invalid_input");
    let b: Record<string, unknown>;
    try {
      b = JSON.parse(text);
      if (!b || typeof b !== "object" || Array.isArray(b)) throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    const key = uuid(b.key);
    let saved: { id: string };
    if (self) {
      if (!id || kind) throw new CommunityError("forbidden", 403);
      if (b.action === "withdraw")
        saved = result(
          await store.submit(user.id, org, id, key, {
            action: "withdraw",
            version: versionInput(b),
          }),
        );
      else if (b.action === "submit")
        saved = result(
          await store.submit(user.id, org, id, key, {
            action: "submit",
            challengeVersion: versionInput({ version: b.challengeVersion }),
            version: b.version == null ? null : versionInput(b),
            note: challengeNote(b.note),
          }),
        );
      else throw new CommunityError("invalid_input");
      const item = (await store.get(user.id, org, id, true))[0];
      if (!item) throw new CommunityError("not_found", 404);
      return respond({ item });
    }
    if (kind === "submissions") {
      if (!id) throw new CommunityError("invalid_input");
      const action = b.action;
      if (
        sid
          ? !["approve", "reject"].includes(String(action))
          : action !== "record"
      )
        throw new CommunityError("invalid_input");
      const body = sid
        ? {
            action,
            version: versionInput(b),
            feedback: challengeNote(b.feedback, 300, action === "reject"),
          }
        : {
            action: "record",
            personId: uuid(b.personId),
            challengeVersion: versionInput({ version: b.challengeVersion }),
            version: b.version == null ? null : versionInput(b),
            feedback: challengeNote(b.feedback, 300, true),
          };
      saved = result(await store.review(user.id, org, id, sid, key, body));
      const item = (await store.submission(user.id, org, id, saved.id))[0];
      if (!item) throw new CommunityError("not_found", 404);
      return respond({ item });
    }
    if (b.action === "create" && !id && request.method === "POST")
      saved = result(
        await store.save(user.id, org, null, key, {
          action: "create",
          ...challengeInput(b, member.timezone),
        }),
      );
    else if (b.action === "edit" && id)
      saved = result(
        await store.save(user.id, org, id, key, {
          action: "edit",
          version: versionInput(b),
          ...challengeInput(b, member.timezone),
        }),
      );
    else if (id && ["publish", "archive"].includes(String(b.action)))
      saved = result(
        await store.save(user.id, org, id, key, {
          action: b.action,
          version: versionInput(b),
        }),
      );
    else throw new CommunityError("invalid_input");
    const item = (await store.get(user.id, org, saved.id, false))[0];
    if (!item) throw new CommunityError("not_found", 404);
    return respond({ item }, id ? 200 : 201);
  } catch (e) {
    if (e instanceof CommunityError) return respond({ code: e.code }, e.status);
    throw e;
  }
}
