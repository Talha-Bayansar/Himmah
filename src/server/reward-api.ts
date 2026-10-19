import {
  CommunityError,
  uuid,
  versionInput,
  pageInput,
  pageResult,
} from "../community/contracts.ts";
import { rewardInput } from "../rewards/contracts.ts";
import type { OrganizationStore } from "./store.ts";
import type { RewardStore } from "./reward-store.ts";
export async function rewardApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  rewards: RewardStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/(?:rewards(?:\/([0-9a-f-]{36})(?:\/(members|redemptions)(?:\/([0-9a-f-]{36}))?)?)?|reward-wallet\/([0-9a-f-]{36}))$/i,
    );
  if (!match) return null;
  const respond = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  try {
    const org = uuid(match[1]),
      id = match[2] ? uuid(match[2]) : null,
      part = match[3],
      redemption = match[4] ? uuid(match[4]) : null,
      person = match[5] ? uuid(match[5]) : null;
    const membership = await organizations.get(user.id, org);
    if (!membership) throw new CommunityError("not_found", 404);
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (!["owner", "admin"].includes(membership.role))
      throw new CommunityError("forbidden", 403);
    const item = id ? (await rewards.get(user.id, org, id))[0] : null;
    if (id && !item) throw new CommunityError("not_found", 404);
    if (request.method === "GET") {
      if (person) {
        const wallet = (await rewards.wallet(user.id, org, person))[0];
        if (!wallet) throw new CommunityError("not_found", 404);
        return respond({ item: wallet });
      }
      if (id && !part) return respond({ item });
      if (redemption) {
        if (part !== "redemptions") throw new CommunityError("not_found", 404);
        const row = (
          await rewards.redemption(user.id, org, id!, redemption)
        )[0];
        if (!row) throw new CommunityError("not_found", 404);
        return respond({ item: row });
      }
      const eligible = url.searchParams.get("eligible") === "true",
        status = url.searchParams.get("status") ?? "all";
      if (!["all", "pending", "fulfilled", "cancelled"].includes(status))
        throw new CommunityError("invalid_input");
      const input = pageInput(
        url,
        `${user.id}:${org}/rewards/${id ?? "list"}/${part ?? "list"}/${eligible}/${status}`,
      );
      if (input.groupId || (part && input.archived))
        throw new CommunityError("invalid_input");
      const rows = !id
        ? await rewards.list(user.id, org, input)
        : part === "members"
          ? await rewards.members(user.id, org, id, input, eligible)
          : await rewards.redemptions(user.id, org, id, input, status);
      return respond(
        pageResult(rows as { id: string; createdAt: string }[], input),
      );
    }
    if (
      person ||
      part === "members" ||
      !(
        (!id && request.method === "POST") ||
        (id && !part && request.method === "PATCH") ||
        (id &&
          part === "redemptions" &&
          ((!redemption && request.method === "POST") ||
            (redemption && request.method === "PATCH")))
      )
    )
      return respond({ code: "not_found" }, 404);
    const text = await request.text();
    if (text.length > 5000) throw new CommunityError("invalid_input");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    let result: { id?: string; code?: string } | undefined;
    if (part === "redemptions") {
      let payload: Record<string, unknown>;
      if (redemption) {
        if (!["fulfilled", "cancelled"].includes(String(body.action)))
          throw new CommunityError("invalid_input");
        payload = { action: body.action, version: versionInput(body) };
        if (body.action === "cancelled") {
          if (
            typeof body.reason !== "string" ||
            !body.reason.trim() ||
            body.reason.trim().length > 300 ||
            /[\u0000-\u001f]/.test(body.reason)
          )
            throw new CommunityError("reward_reason");
          payload.reason = body.reason.trim();
        }
      } else
        payload = {
          personId: uuid(body.personId),
          rewardVersion: versionInput({ version: body.rewardVersion }),
        };
      result = (
        await rewards.redeem(
          user.id,
          org,
          id!,
          redemption,
          redemption ? null : uuid(body.key),
          payload,
        )
      )[0]?.result as typeof result;
    } else {
      const payload =
        id && body.action === "archive"
          ? typeof body.archived === "boolean"
            ? {
                action: "archive",
                archived: body.archived,
                version: versionInput(body),
              }
            : (() => {
                throw new CommunityError("invalid_input");
              })()
          : {
              ...rewardInput(body),
              ...(id ? { action: "edit", version: versionInput(body) } : {}),
            };
      result = (
        await rewards.save(
          user.id,
          org,
          id,
          id ? null : uuid(body.key),
          payload,
        )
      )[0]?.result as typeof result;
    }
    if (!result) throw new CommunityError("service", 503);
    if (result.code)
      throw new CommunityError(
        result.code,
        result.code === "forbidden"
          ? 403
          : result.code === "not_found"
            ? 404
            : result.code === "invalid_input" || result.code === "reward_reason"
              ? 400
              : 409,
      );
    return respond(
      {
        item:
          part === "redemptions"
            ? (await rewards.redemption(user.id, org, id!, result.id!))[0]
            : (await rewards.get(user.id, org, result.id!))[0],
      },
      request.method === "POST" ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    throw error;
  }
}
