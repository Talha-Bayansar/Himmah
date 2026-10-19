import {
  CommunityError,
  uuid,
  pageInput,
  pageResult,
  versionInput,
} from "../community/contracts.ts";
import type { CouponStore } from "./coupon-store.ts";
import type { OrganizationStore } from "./store.ts";
export async function couponApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  coupons: CouponStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/(me\/(claims|coupons)(?:\/([0-9a-f-]{36}))?|coupon-collection)$/i,
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
    const v = rows[0]?.result as { code?: string; id: string } | undefined;
    if (!v) throw new CommunityError("service", 503);
    if (v.code)
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
  };
  try {
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    const org = uuid(match[1]),
      kind = match[3],
      id = match[4] ? uuid(match[4]) : null,
      self = !!kind;
    const membership = await organizations.get(user.id, org);
    if (!membership) throw new CommunityError("not_found", 404);
    if (
      self
        ? membership.role !== "participant"
        : !["owner", "admin"].includes(membership.role)
    )
      throw new CommunityError("forbidden", 403);
    if (self && request.method === "GET" && kind === "coupons") {
      if (id) {
        const item = (await coupons.get(user.id, org, id))[0];
        if (!item) throw new CommunityError("not_found", 404);
        return respond({ item });
      }
      const status = url.searchParams.get("status") ?? "pending";
      if (!["pending", "all"].includes(status))
        throw new CommunityError("invalid_input");
      const input = pageInput(url, `${user.id}:${org}/coupons/${status}`);
      if (input.archived || input.groupId)
        throw new CommunityError("invalid_input");
      return respond(
        pageResult(
          (await coupons.list(user.id, org, input, status)) as {
            id: string;
            createdAt: string;
          }[],
          input,
        ),
      );
    }
    if (!(
      (kind === "claims" && !id && request.method === "POST") ||
      (kind === "coupons" && id && request.method === "PATCH") ||
      (!self && ["POST", "PATCH"].includes(request.method))
    ))
      return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 2000) throw new CommunityError("invalid_input");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    if (self) {
      const saved =
        kind === "claims"
          ? result(
              await coupons.claim(
                user.id,
                org,
                uuid(body.rewardId),
                uuid(body.key),
                versionInput({ version: body.rewardVersion }),
              ),
            )
          : body.action === "cancelled"
            ? result(
                await coupons.cancel(user.id, org, id!, versionInput(body)),
              )
            : (() => {
                throw new CommunityError("forbidden", 403);
              })();
      const item = (await coupons.get(user.id, org, saved.id))[0];
      if (!item) throw new CommunityError("not_found", 404);
      return respond({ item }, kind === "claims" ? 201 : 200);
    }
    if (typeof body.code !== "string" || !/^[0-9a-f]{64}$/.test(body.code))
      throw new CommunityError("coupon_invalid");
    if (request.method === "PATCH") {
      if (body.action !== "fulfilled")
        throw new CommunityError("invalid_input");
      result(
        await coupons.collect(user.id, org, body.code, versionInput(body)),
      );
    }
    const item = (await coupons.preview(user.id, org, body.code))[0];
    if (!item) throw new CommunityError("not_found", 404);
    return respond({ item });
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    throw error;
  }
}
