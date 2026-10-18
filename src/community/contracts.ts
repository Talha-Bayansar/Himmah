export type StaffRole = "owner" | "admin" | "volunteer";
export type Person = {
  id: string;
  name: string;
  archived: boolean;
  version: number;
  createdAt: string;
};
export type Group = Person;
export type GroupOption = Group & { assigned: boolean };
export type Staff = {
  id: string;
  name: string | null;
  role: StaffRole;
  createdAt: string;
};
export type Invitation = {
  id: string;
  email: string;
  role: "admin" | "volunteer";
  expiresAt: string;
  revoked: boolean;
  accepted: boolean;
  createdAt: string;
};
export type Page<T> = { items: T[]; nextCursor: string | null };
export type PageInput = {
  limit: number;
  query: string;
  archived: boolean;
  after: { at: string; id: string } | null;
  scope: string;
  groupId?: string;
};
export class CommunityError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new CommunityError("invalid_input");
  return value;
}
export function nameInput(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 80 || /[\u0000-\u001f]/.test(name))
    throw new CommunityError("invalid_name");
  return name;
}
export function versionInput(body: Record<string, unknown>) {
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 1)
    throw new CommunityError("invalid_input");
  return Number(body.version);
}
export function pageInput(url: URL, scope: string): PageInput {
  const limit = Number(url.searchParams.get("limit") ?? 25);
  const query = (url.searchParams.get("q") ?? "").trim();
  const archived = url.searchParams.get("archived") === "true";
  const groupId = url.searchParams.get("group") || undefined;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || query.length > 80)
    throw new CommunityError("invalid_input");
  if (groupId) uuid(groupId);
  const bound = JSON.stringify([scope, query, archived, groupId ?? null]);
  let after: PageInput["after"] = null;
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    try {
      if (cursor.length > 2000) throw Error();
      const parsed = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(
            atob(cursor.replace(/-/g, "+").replace(/_/g, "/")),
            (c) => c.charCodeAt(0),
          ),
        ),
      );
      if (
        parsed.scope !== bound ||
        typeof parsed.id !== "string" ||
        parsed.id.length > 128 ||
        typeof parsed.at !== "string" ||
        parsed.at.length > 64 ||
        !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(
          parsed.at,
        ) ||
        !Number.isFinite(Date.parse(parsed.at))
      )
        throw Error();
      if (!scope.endsWith("/staff")) uuid(parsed.id);
      after = { at: parsed.at, id: parsed.id };
    } catch {
      throw new CommunityError("invalid_cursor");
    }
  }
  return {
    limit,
    query,
    archived,
    after,
    scope: bound,
    ...(groupId ? { groupId } : {}),
  };
}
export function pageResult<T extends { id: string; createdAt: string }>(
  rows: T[],
  input: PageInput,
): Page<T> {
  const items = rows.slice(0, input.limit);
  const last = items.at(-1);
  const nextCursor =
    rows.length > input.limit && last
      ? btoa(
          String.fromCharCode(
            ...new TextEncoder().encode(
              JSON.stringify({
                scope: input.scope,
                at: last.createdAt,
                id: last.id,
              }),
            ),
          ),
        )
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "")
      : null;
  return { items, nextCursor };
}
export function invitationInput(body: Record<string, unknown>) {
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !["admin", "volunteer"].includes(String(body.role))
  )
    throw new CommunityError("invalid_input");
  return {
    email,
    role: body.role as "admin" | "volunteer",
    key: uuid(body.key),
  };
}
export async function tokenHash(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new CommunityError("invalid_invitation");
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export function newToken() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
