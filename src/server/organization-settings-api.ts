import { CommunityError, uuid } from "../community/contracts.ts";
import { settingsInput } from "../organization/settings-contracts.ts";
import type { OrganizationSettingsStore } from "./organization-settings-store.ts";
export async function organizationSettingsApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  store: OrganizationSettingsStore,
) {
  const respond = (v: unknown, status = 200) =>
    Response.json(v, {
      status,
      headers: {
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  try {
    const match = new URL(request.url).pathname.match(
      /^\/api\/organizations\/([^/]+)\/settings$/,
    );
    if (!match) return respond({ code: "not_found_or_forbidden" }, 404);
    if (!user.emailVerified) return respond({ code: "verify_required" }, 403);
    const org = uuid(match[1]);
    const current = await store.read(user.id, org);
    if (!current) return respond({ code: "not_found_or_forbidden" }, 404);
    if (request.method === "GET") return respond(current);
    if (request.method !== "POST")
      return respond({ code: "invalid_input" }, 405);
    const text = await request.text();
    if (text.length > 8000) throw new CommunityError("invalid_input");
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new CommunityError("invalid_input");
    }
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      Object.keys(raw).some(
        (k) =>
          ![
            "name",
            "description",
            "email",
            "phone",
            "timezone",
            "defaultLanguage",
            "quietEnabled",
            "quietStart",
            "quietEnd",
            "version",
            "key",
          ].includes(k),
      )
    )
      throw new CommunityError("invalid_input");
    const result = await store.save(user.id, org, settingsInput(raw));
    return respond(
      result,
      result.code
        ? result.code === "not_found_or_forbidden"
          ? 404
          : ["version_conflict", "request_key_conflict"].includes(result.code)
            ? 409
            : 400
        : 200,
    );
  } catch (e) {
    return e instanceof CommunityError
      ? respond({ code: e.code }, e.status)
      : respond({ code: "service" }, 503);
  }
}
