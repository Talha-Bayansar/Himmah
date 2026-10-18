import {
  CommunityError,
  uuid,
  nameInput,
  versionInput,
  pageInput,
  pageResult,
  invitationInput,
  tokenHash,
  type StaffRole,
} from "../community/contracts.ts";
import type { CommunityStore, DirectoryIdentity } from "./community-store.ts";
import type { OrganizationStore } from "./store.ts";
export async function communityApi(
  request: Request,
  user: DirectoryIdentity & { emailVerified: boolean },
  organizations: OrganizationStore,
  directory: CommunityStore,
): Promise<Response | null> {
  const url = new URL(request.url);
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
    if (text.length > 8000) throw new CommunityError("invalid_input");
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw Error();
      return value as Record<string, unknown>;
    } catch {
      throw new CommunityError("invalid_input");
    }
  };
  try {
    if (
      ["/api/invitations/accept", "/api/invitations/preview"].includes(
        url.pathname,
      ) &&
      request.method === "POST"
    ) {
      if (!user.emailVerified) throw new CommunityError("verify_required", 403);
      const value = await body();
      const hash = await tokenHash(String(value.token ?? ""));
      if (url.pathname.endsWith("/preview")) {
        const result = await directory.preview(user, hash);
        if (!result[0]) throw new CommunityError("invalid_invitation", 404);
        return respond({ organization: result[0] });
      }
      const result = await directory.accept(user, hash);
      if (!result[0]) throw new CommunityError("invalid_invitation", 404);
      return respond({ organizationId: result[0].id });
    }
    const match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/(people|groups|staff|invitations)(?:\/([^/]+))?(?:\/groups\/([0-9a-f-]{36}))?$/i,
    );
    if (!match) return null;
    const orgId = uuid(match[1]);
    const kind = match[2]!.toLowerCase();
    const id = match[3];
    const groupId = match[4];
    const org = await organizations.get(user.id, orgId);
    if (!org) throw new CommunityError("not_found", 404);
    if (!["owner", "admin"].includes(org.role))
      throw new CommunityError("forbidden", 403);
    if (request.method !== "GET" && !user.emailVerified)
      throw new CommunityError("verify_required", 403);
    if (request.method === "GET" && !id) {
      const input = pageInput(url, orgId + "/" + kind);
      const rows =
        kind === "staff"
          ? await directory.staff(user.id, orgId, input)
          : kind === "invitations"
            ? await directory.invites(user.id, orgId, input)
            : await directory.list(
                user.id,
                orgId,
                kind as "people" | "groups",
                input,
              );
      return respond(
        pageResult(
          rows as unknown as { id: string; createdAt: string }[],
          input,
        ),
      );
    }
    const value = await body();
    if ((kind === "people" || kind === "groups") && !groupId) {
      let result;
      if (!id && request.method === "POST") {
        if (kind === "people" && value.consent !== true)
          throw new CommunityError("consent_required");
        result = await directory.create(
          user.id,
          orgId,
          kind,
          nameInput(value),
          uuid(value.key),
        );
      } else if (id && request.method === "PATCH") {
        const name = value.name === undefined ? null : nameInput(value);
        const archived =
          typeof value.archived === "boolean" ? value.archived : null;
        if (name === null && archived === null)
          throw new CommunityError("invalid_input");
        result = await directory.update(
          user.id,
          orgId,
          kind,
          uuid(id),
          versionInput(value),
          name,
          archived,
        );
      } else return respond({ code: "not_found" }, 404);
      if (!result[0]) throw new CommunityError("conflict", 409);
      return respond(
        { item: result[0] },
        request.method === "POST" ? 201 : 200,
      );
    }
    if (
      kind === "people" &&
      id &&
      groupId &&
      ["PUT", "DELETE"].includes(request.method)
    ) {
      const rows = await directory.setGroup(
        user.id,
        orgId,
        uuid(id),
        uuid(groupId),
        request.method === "PUT",
      );
      if (!rows[0]) throw new CommunityError("conflict", 409);
      return respond({ success: true });
    }
    if (
      kind === "staff" &&
      id &&
      ["PATCH", "DELETE"].includes(request.method)
    ) {
      if (
        id.length > 128 ||
        !["admin", "volunteer"].includes(String(value.previous))
      )
        throw new CommunityError("invalid_input");
      if (
        request.method === "PATCH" &&
        (org.role !== "owner" ||
          !["admin", "volunteer"].includes(String(value.role)))
      )
        throw new CommunityError("forbidden", 403);
      const result = await directory.changeStaff(
        user.id,
        orgId,
        id,
        value.previous as StaffRole,
        request.method === "DELETE"
          ? null
          : (value.role as "admin" | "volunteer"),
      );
      if (!result[0]) throw new CommunityError("conflict", 409);
      return respond({ success: true });
    }
    if (kind === "invitations" && !id && request.method === "POST") {
      const input = invitationInput(value);
      if (input.role === "admin" && org.role !== "owner")
        throw new CommunityError("forbidden", 403);
      const result = await directory.invite(
        user.id,
        orgId,
        input.email,
        input.role,
        input.key,
        await tokenHash(String(value.token ?? "")),
      );
      if (!result[0]) throw new CommunityError("conflict", 409);
      return respond({ id: result[0].id }, 201);
    }
    if (kind === "invitations" && id && request.method === "DELETE") {
      const result = await directory.revoke(user.id, orgId, uuid(id));
      if (!result[0]) throw new CommunityError("conflict", 409);
      return respond({ success: true });
    }
    return respond({ code: "not_found" }, 404);
  } catch (error) {
    if (error instanceof CommunityError)
      return respond({ code: error.code }, error.status);
    const db = error as { code?: string; cause?: { code?: string } };
    if (db.code === "23505" || db.cause?.code === "23505")
      return respond({ code: "duplicate_name" }, 409);
    throw error;
  }
}
