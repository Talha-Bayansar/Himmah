import {
  CommunityError,
  pageInput,
  pageResult,
  uuid,
} from "../community/contracts.ts";
import { cashInput, cashViews, type CashView } from "../cash/contracts.ts";
import type { CashStore } from "./cash-store.ts";
import type { OrganizationStore } from "./store.ts";
export async function cashApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: CashStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/activities\/([0-9a-f-]{36})\/sessions\/([0-9a-f-]{36})\/cash(?:\/charges\/([0-9a-f-]{36}))?$/i,
    );
  if (!match) return null;
  const respond = (value: unknown, status = 200) =>
    Response.json(value, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  try {
    const org = uuid(match[1]),
      activity = uuid(match[2]),
      session = uuid(match[3]),
      id = match[4] ? uuid(match[4]) : undefined;
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (!(await organizations.get(user.id, org)))
      throw new CommunityError("not_found", 404);
    const summary = (await store.summary(user.id, org, activity, session))[0];
    if (!summary) throw new CommunityError("forbidden", 403);
    for (const field of [
      "owedMinor",
      "paidMinor",
      "outstandingMinor",
      "collectedMinor",
      "unallocatedMinor",
    ]) {
      if (
        summary[field] !== null &&
        (!Number.isSafeInteger(summary[field]) || Number(summary[field]) < 0)
      )
        throw new CommunityError("service", 503);
    }
    if (request.method === "GET") {
      const view = id ? "all" : (url.searchParams.get("view") ?? "all");
      if (!cashViews.includes(view as CashView))
        throw new CommunityError("invalid_input");
      if (view === "history" && !summary.canManage)
        throw new CommunityError("forbidden", 403);
      const p = pageInput(
        url,
        `${user.id}:${org}/cash/${activity}/${session}/${view}/${id ?? ""}`,
      );
      if (p.archived || p.groupId) throw new CommunityError("invalid_input");
      const rows =
        view === "history"
          ? await store.history(user.id, org, activity, session, p)
          : await store.list(
              user.id,
              org,
              activity,
              session,
              p,
              view as CashView,
              id,
            );
      if (id) {
        if (!rows[0]) throw new CommunityError("not_found", 404);
        return respond({ item: rows[0], summary });
      }
      return respond({
        ...pageResult(rows as { id: string; createdAt: string }[], p),
        summary,
      });
    }
    if (request.method !== "POST" || id)
      return respond({ code: "not_found" }, 404);
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
    const input = cashInput(body, String(summary.timezone)),
      result = (
        await store.command(
          user.id,
          org,
          activity,
          session,
          input.key,
          input.payload,
        )
      )[0]?.result as Record<string, unknown> | undefined;
    if (!result) throw new CommunityError("service", 503);
    if (typeof result.code === "string")
      throw new CommunityError(
        result.code,
        result.code === "forbidden"
          ? 403
          : result.code === "not_found"
            ? 404
            : result.code === "invalid_input"
              ? 400
              : 409,
      );
    return respond(result);
  } catch (e) {
    if (e instanceof CommunityError) return respond({ code: e.code }, e.status);
    throw e;
  }
}
