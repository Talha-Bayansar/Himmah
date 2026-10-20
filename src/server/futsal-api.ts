import {
  CommunityError,
  uuid,
  nameInput,
  versionInput,
  pageInput,
  pageResult,
} from "../community/contracts.ts";
import {
  seasonInput,
  seasonPlan,
  type FutsalSeason,
  type FutsalEntry,
} from "../futsal/contracts.ts";
import type { OrganizationStore } from "./store.ts";
import type { FutsalStore } from "./futsal-store.ts";
/** Explicit early-access app policy; a future organization entitlement must not alter sporting rules. */
export const canManageFutsal = (role: string) =>
  ["owner", "admin"].includes(role);
export async function futsalApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: FutsalStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/futsal\/seasons(?:\/([0-9a-f-]{36})(?:\/(entries|candidates|preview|prepare|cancel)(?:\/([0-9a-f-]{36}))?)?)?$/i,
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
  try {
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    const org = uuid(match[1]),
      id = match[2] ? uuid(match[2]) : null,
      part = match[3],
      entry = match[4] ? uuid(match[4]) : null;
    if (entry && part !== "entries") throw new CommunityError("invalid_input");
    const member = await organizations.get(user.id, org);
    if (!member) throw new CommunityError("not_found", 404);
    if (!canManageFutsal(member.role))
      throw new CommunityError("forbidden", 403);
    const season = id
      ? ((await store.get(user.id, org, id))[0] as FutsalSeason | undefined)
      : null;
    if (id && !season) throw new CommunityError("not_found", 404);
    if (request.method === "GET") {
      if (entry || ["prepare", "cancel"].includes(part ?? ""))
        return respond({ code: "not_found" }, 404);
      if (id && !part) return respond({ item: season });
      if (part === "preview") {
        if (season!.snapshot)
          return respond({ ...season!.snapshot, ready: false, problems: [] });
        // A season is bounded to 16 entries; planning requires this complete bounded snapshot.
        const entries = (
          (await store.entries(user.id, org, id!)) as FutsalEntry[]
        ).sort(
          (a, b) =>
            Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
            a.id.localeCompare(b.id),
        );
        const problems: string[] = [];
        if (entries.length !== season!.settings.entryCount)
          problems.push("futsal_entries");
        if (
          entries.some(
            (e) =>
              e.members.length !== season!.settings.playersPerTeam ||
              e.members.some((p) => p.archived),
          )
        )
          problems.push("futsal_member");
        if (Date.parse(season!.settings.preparationStartsAt) <= Date.now())
          problems.push("futsal_future");
        const ids = Array.from(
          { length: season!.settings.entryCount },
          (_, i) => entries[i]?.id ?? "slot-" + i,
        );
        const plan = seasonPlan(season!.settings, ids, season!.seed);
        return respond({
          plan,
          entries,
          settings: season!.settings,
          ready: season!.status === "draft" && !problems.length,
          problems,
        });
      }
      const status = url.searchParams.get("status") ?? "draft";
      if (!["all", "draft", "prepared", "cancelled"].includes(status))
        throw new CommunityError("invalid_input");
      const p = pageInput(
        url,
        `${user.id}:${org}/futsal/${id ?? "list"}/${part ?? status}`,
      );
      if (p.archived || p.groupId) throw new CommunityError("invalid_input");
      const rows =
        part === "candidates"
          ? await store.candidates(user.id, org, id!, p)
          : part === "entries"
            ? await store.entries(user.id, org, id!, p)
            : await store.list(user.id, org, p, status);
      return respond(
        pageResult(rows as { id: string; createdAt: string }[], p),
      );
    }
    if (!["POST", "PATCH", "DELETE"].includes(request.method))
      return respond({ code: "not_found" }, 404);
    const allowed = !id
      ? request.method === "POST"
      : part === "entries"
        ? entry
          ? ["PATCH", "DELETE"].includes(request.method)
          : request.method === "POST"
        : ["prepare", "cancel"].includes(part ?? "")
          ? request.method === "POST"
          : !part && request.method === "PATCH";
    if (!allowed) return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 16000) throw new CommunityError("invalid_input");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    let payload: Record<string, unknown> = {};
    if (!part)
      payload = {
        ...seasonInput(body, season?.settings.timezone ?? member.timezone),
        operation: "save",
        ...(id ? { version: versionInput(body) } : {}),
      };
    else if (part === "entries") {
      payload = {
        operation: request.method === "DELETE" ? "remove_entry" : "entry",
        version: versionInput(body),
      };
      if (request.method !== "DELETE") {
        if (!Array.isArray(body.members) || body.members.length > 5)
          throw new CommunityError("futsal_roster");
        const members = body.members.map((m) => uuid(m)).sort();
        if (new Set(members).size !== members.length)
          throw new CommunityError("futsal_roster");
        payload = { ...payload, name: nameInput(body), members };
      }
    } else if (part === "prepare") {
      const entries = (
        (await store.entries(user.id, org, id!)) as FutsalEntry[]
      ).sort(
        (a, b) =>
          Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
          a.id.localeCompare(b.id),
      );
      payload = {
        operation: "prepare",
        version: versionInput(body),
        plan:
          season!.snapshot?.plan ??
          seasonPlan(
            season!.settings,
            entries.map((e) => e.id),
            season!.seed,
          ),
      };
    } else {
      if (
        typeof body.reason !== "string" ||
        !body.reason.trim() ||
        body.reason.length > 300 ||
        /[\u0000-\u001f]/.test(body.reason)
      )
        throw new CommunityError("invalid_input");
      payload = {
        operation: "cancel",
        version: versionInput(body),
        reason: body.reason.trim(),
      };
    }
    const r = (
      await store.command(user.id, org, id, entry, uuid(body.key), payload)
    )[0]?.result as
      { id?: string; entryId?: string; code?: string } | undefined;
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
    return respond({ item: { id: r.id, entryId: r.entryId } }, !id ? 201 : 200);
  } catch (e) {
    return e instanceof CommunityError
      ? respond({ code: e.code }, e.status)
      : respond({ code: "service" }, 503);
  }
}
