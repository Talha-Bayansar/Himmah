import {
  CommunityError,
  uuid,
  pageInput,
  pageResult,
  tokenHash,
} from "../community/contracts.ts";
import { participantInvitationInput } from "../participants/contracts.ts";
import type { ParticipantStore } from "./participant-store.ts";
import type { OrganizationStore } from "./store.ts";
import type { DirectoryIdentity } from "./community-store.ts";
export async function participantApi(
  request: Request,
  user: DirectoryIdentity & { emailVerified: boolean },
  organizations: OrganizationStore,
  participants: ParticipantStore,
) {
  const url = new URL(request.url),
    invite = url.pathname.match(
      /^\/api\/participant-invitations\/(preview|accept)$/,
    ),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/(me(?:\/(points|rewards|redemptions))?|participants\/([0-9a-f-]{36})(?:\/(invitations|links|events)(?:\/([0-9a-f-]{36}))?)?)$/i,
    );
  if (!invite && !match) return null;
  const respond = (value: unknown, status = 200) =>
    Response.json(value, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  const body = async () => {
    const text = await request.text();
    if (text.length > 5000) throw new CommunityError("invalid_input");
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw Error();
      return value as Record<string, unknown>;
    } catch {
      throw new CommunityError("invalid_input");
    }
  };
  const result = (r: Record<string, unknown>[]) => {
    const v = r[0]?.result as
      { code?: string; id?: string; organizationId?: string } | undefined;
    if (!v) throw new CommunityError("service", 503);
    if (v.code)
      throw new CommunityError(
        v.code,
        v.code === "forbidden"
          ? 403
          : v.code === "not_found" || v.code === "invalid_invitation"
            ? 404
            : v.code === "participant_consent" ||
                v.code === "participant_reason" ||
                v.code === "invalid_input"
              ? 400
              : 409,
      );
    return v;
  };
  try {
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (invite) {
      if (request.method !== "POST") return respond({ code: "not_found" }, 404);
      const value = await body(),
        hash = await tokenHash(String(value.token ?? ""));
      if (invite[1] === "preview") {
        const item = (await participants.preview(user, hash))[0];
        if (!item) throw new CommunityError("invalid_invitation", 404);
        return respond({ item });
      }
      return respond(result(await participants.accept(user, hash)));
    }
    const org = uuid(match![1]),
      self = match![2]!.startsWith("me"),
      person = match![4] ? uuid(match![4]) : null,
      part = match![5],
      id = match![6] ? uuid(match![6]) : null;
    const membership = await organizations.get(user.id, org);
    if (!membership) throw new CommunityError("not_found", 404);
    if (self) {
      if (request.method !== "GET") return respond({ code: "forbidden" }, 403);
      const item = (await participants.summary(user.id, org))[0];
      if (!item) throw new CommunityError("not_found", 404);
      const section = match![3];
      if (!section) return respond({ item });
      const input = pageInput(url, `${user.id}:${org}/me/${section}`);
      if (
        input.archived ||
        input.groupId ||
        (section === "points" && input.query)
      )
        throw new CommunityError("invalid_input");
      const rows = await participants[
        section as "points" | "rewards" | "redemptions"
      ](user.id, org, input);
      return respond(
        pageResult(rows as { id: string; createdAt: string }[], input),
      );
    }
    if (!["owner", "admin"].includes(membership.role))
      throw new CommunityError("forbidden", 403);
    const account = (await participants.account(user.id, org, person!))[0];
    if (!account) throw new CommunityError("not_found", 404);
    if (request.method === "GET") {
      if (!part) return respond({ item: account });
      if (id || part === "links") return respond({ code: "not_found" }, 404);
      const input = pageInput(
        url,
        `${user.id}:${org}/participants/${person}/${part}`,
      );
      if (input.query || input.archived || input.groupId)
        throw new CommunityError("invalid_input");
      const rows =
        part === "events"
          ? await participants.events(user.id, org, person!, input)
          : await participants.invitations(user.id, org, person!, input);
      return respond(
        pageResult(rows as { id: string; createdAt: string }[], input),
      );
    }
    if (part === "invitations" && !id && request.method === "POST") {
      const value = await body(),
        input = participantInvitationInput(value),
        hash = await tokenHash(String(value.token ?? ""));
      return respond(
        result(
          await participants.invite(
            user.id,
            org,
            person!,
            input.key,
            input.email,
            hash,
            input.consent,
          ),
        ),
        201,
      );
    }
    if (
      id &&
      ["invitations", "links"].includes(part!) &&
      request.method === "DELETE"
    ) {
      const value = await body();
      if (
        part === "links" &&
        (typeof value.reason !== "string" ||
          !value.reason.trim() ||
          value.reason.trim().length > 300)
      )
        throw new CommunityError("participant_reason");
      return respond(
        result(
          await participants.revoke(
            user.id,
            org,
            person!,
            id,
            part === "links" ? "link" : "invitation",
            part === "links" ? String(value.reason).trim() : null,
          ),
        ),
      );
    }
    return respond({ code: "not_found" }, 404);
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    throw error;
  }
}
