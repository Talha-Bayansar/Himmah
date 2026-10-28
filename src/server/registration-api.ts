import {
  CommunityError,
  pageInput,
  pageResult,
  uuid,
} from "../community/contracts.ts";
import {
  registrationInput,
  registrationViews,
  type RegistrationView,
} from "../registration/contracts.ts";
import type { OrganizationStore } from "./store.ts";
import type { RegistrationStore } from "./registration-store.ts";
export async function registrationApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  store: RegistrationStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/activities\/([0-9a-f-]{36})\/sessions\/([0-9a-f-]{36})\/registrations(?:\/(options))?$/i,
    );
  if (!match) return null;
  const respond = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  function result(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object")
      throw new CommunityError("service", 503);
    const v = value as Record<string, unknown>;
    if (typeof v.code === "string")
      throw new CommunityError(
        v.code,
        v.code === "forbidden"
          ? 403
          : v.code === "not_found"
            ? 404
            : v.code === "invalid_input"
              ? 400
              : 409,
      );
    return v;
  }
  try {
    const org = uuid(match[1]),
      activity = uuid(match[2]),
      session = uuid(match[3]),
      options = !!match[4];
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (!(await organizations.get(user.id, org)))
      throw new CommunityError("not_found", 404);
    if (request.method === "GET") {
      const summary = result(
          (await store.summary(user.id, org, activity, session))[0]?.result,
        ),
        view = url.searchParams.get("view") ?? "confirmed";
      if (
        !registrationViews.includes(view as RegistrationView) ||
        (options && view !== "confirmed")
      )
        throw new CommunityError("invalid_input");
      if (view === "history" && !summary.canManage)
        throw new CommunityError("forbidden", 403);
      const p = pageInput(
        url,
        `${user.id}:${org}/registrations/${activity}/${session}/${options ? "options" : view}`,
      );
      if (p.archived || p.groupId) throw new CommunityError("invalid_input");
      const rows = options
        ? await store.options(user.id, org, activity, session, p)
        : await store.list(
            user.id,
            org,
            activity,
            session,
            p,
            view as RegistrationView,
          );
      return respond({
        ...pageResult(rows as { id: string; createdAt: string }[], p),
        ...(!options ? { summary } : {}),
      });
    }
    if (request.method !== "POST" || options)
      return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 8000) throw new CommunityError("invalid_input");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    const input = registrationInput(body),
      response = result(
        (
          await store.command(
            user.id,
            org,
            activity,
            session,
            input.key,
            input.payload,
          )
        )[0]?.result,
      );
    return respond(response);
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    throw error;
  }
}
