import { pageInput, pageResult } from "../../community/contracts.ts";
import {
  uuid,
  expectedVersion,
  groupInput,
  reasonInput,
  relationshipTypeInput,
  PeopleError,
} from "./contracts.ts";
import type { PeopleStore } from "./store.ts";
import type { CommandResult } from "./directory-store.ts";
export async function directoryApi(
  request: Request,
  user: { id: string },
  store: PeopleStore,
  org: string,
  parts: string[],
  body: () => Promise<Record<string, unknown>>,
): Promise<{ value: unknown; status?: number } | null> {
  const url = new URL(request.url),
    [kind, rawId, child, rawChildId] = parts;
  const historyText = url.searchParams.get("history");
  if (historyText !== null && !["true", "false"].includes(historyText))
    throw new PeopleError("invalid_input");
  const history = historyText === "true",
    id = rawId ? uuid(rawId) : null;
  const paged = () =>
    pageInput(
      url,
      JSON.stringify(["directory-v1", user.id, org, ...parts, history]),
    );
  const result = (r: CommandResult) =>
    r.code
      ? {
          value: { code: r.code },
          status:
            r.code === "not_found_or_forbidden"
              ? 404
              : r.code === "invalid_input"
                ? 400
                : 409,
        }
      : { value: r };
  const notFound = () => ({
    value: { code: "not_found_or_forbidden" },
    status: 404,
  });
  if (
    kind === "contacts" &&
    id &&
    ["memberships", "relationships", "group-options"].includes(child ?? "")
  ) {
    if (!(await store.get(user.id, org, id))) return notFound();
    if (request.method === "GET" && !rawChildId) {
      const p = paged();
      return {
        value: {
          ...(child === "group-options"
            ? {}
            : {
                total: await store.collectionCount(
                  user.id,
                  org,
                  id,
                  child as "memberships" | "relationships",
                  p,
                  history,
                ),
              }),
          ...pageResult<{ id: string; createdAt: string }>(
            child === "group-options"
              ? await store.groupOptions(user.id, org, id, p)
              : child === "memberships"
                ? await store.contactGroups(user.id, org, id, p, history)
                : await store.relationships(user.id, org, id, p, history),
            p,
          ),
        },
      };
    }
    if (child !== "relationships")
      return { value: { code: "invalid_input" }, status: 405 };
    const b = await body(),
      key = uuid(b.requestKey),
      version = expectedVersion(b.version);
    if (request.method === "POST" && !rawChildId) {
      if (!["subject_is_role", "other_is_role"].includes(String(b.direction)))
        throw new PeopleError("invalid_input");
      return result(
        await store.relationshipCommand(user.id, org, "add_relationship", key, {
          contactId: id,
          version,
          otherContactId: uuid(b.otherContactId),
          otherVersion: expectedVersion(b.otherVersion),
          typeId: uuid(b.typeId),
          typeVersionId: uuid(b.typeVersionId),
          direction: b.direction,
        }),
      );
    }
    if (request.method === "DELETE" && rawChildId)
      return result(
        await store.relationshipCommand(user.id, org, "end_relationship", key, {
          contactId: id,
          version,
          relationshipId: uuid(rawChildId),
          relationshipVersion: expectedVersion(b.relationshipVersion),
          reason: reasonInput(b.reason),
        }),
      );
    return { value: { code: "invalid_input" }, status: 405 };
  }
  if (kind !== "groups" && kind !== "relationship-types") return null;
  if (
    id &&
    !(kind === "groups"
      ? await store.getGroup(user.id, org, id)
      : await store.getRelationshipType(user.id, org, id))
  )
    return notFound();
  if (request.method === "GET") {
    if (rawChildId) return notFound();
    const p = paged();
    if (!id && !child)
      return {
        value: pageResult<{ id: string; createdAt: string }>(
          kind === "groups"
            ? await store.groupList(user.id, org, p)
            : await store.relationshipTypes(user.id, org, p),
          p,
        ),
      };
    if (!child)
      return {
        value:
          kind === "groups"
            ? await store.getGroup(user.id, org, id!)
            : await store.getRelationshipType(user.id, org, id!),
      };
    if (kind === "groups" && id) {
      if (child === "members")
        return {
          value: pageResult(
            await store.groupMembers(user.id, org, id, p, history),
            p,
          ),
        };
      if (child === "member-options")
        return {
          value: pageResult(await store.memberOptions(user.id, org, id, p), p),
        };
      if (child === "history")
        return {
          value: pageResult(await store.groupHistory(user.id, org, id, p), p),
        };
    }
    return notFound();
  }
  const b = await body(),
    key = uuid(b.requestKey);
  let op: string, payload: Record<string, unknown>;
  if (kind === "groups") {
    if (!id && request.method === "POST" && !child) {
      op = "create";
      payload = groupInput(b);
    } else if (id && !child && request.method === "PATCH") {
      op = "update";
      payload = {
        groupId: id,
        version: expectedVersion(b.version),
        ...groupInput(b),
      };
    } else if (
      id &&
      ["archive", "restore"].includes(child ?? "") &&
      request.method === "POST" &&
      !rawChildId
    ) {
      op = child!;
      payload = { groupId: id, version: expectedVersion(b.version) };
    } else if (
      id &&
      child === "assignments" &&
      request.method === "POST" &&
      !rawChildId
    ) {
      if (
        !Array.isArray(b.contacts) ||
        b.contacts.length < 1 ||
        b.contacts.length > 50
      )
        throw new PeopleError("invalid_input");
      const contacts = b.contacts.map((c) => {
        if (!c || typeof c !== "object" || Array.isArray(c))
          throw new PeopleError("invalid_input");
        return { id: uuid(c.id), version: expectedVersion(c.version) };
      });
      if (new Set(contacts.map((c) => c.id)).size !== contacts.length)
        throw new PeopleError("invalid_input");
      op = "assign";
      payload = { groupId: id, version: expectedVersion(b.version), contacts };
    } else if (
      id &&
      child === "members" &&
      rawChildId &&
      request.method === "DELETE"
    ) {
      op = "end_membership";
      payload = {
        groupId: id,
        version: expectedVersion(b.version),
        membershipId: uuid(rawChildId),
        membershipVersion: expectedVersion(b.membershipVersion),
        reason: reasonInput(b.reason),
      };
    } else return { value: { code: "invalid_input" }, status: 405 };
    return result(await store.groupCommand(user.id, org, op, key, payload));
  }
  if (!id && request.method === "POST" && !child) {
    op = "create";
    payload = relationshipTypeInput(b, true);
  } else if (id && !child && request.method === "PATCH") {
    op = "publish";
    payload = {
      typeId: id,
      version: expectedVersion(b.version),
      ...relationshipTypeInput(b, false),
    };
  } else if (
    id &&
    ["archive", "restore"].includes(child ?? "") &&
    request.method === "POST" &&
    !rawChildId
  ) {
    op = child!;
    payload = { typeId: id, version: expectedVersion(b.version) };
  } else return { value: { code: "invalid_input" }, status: 405 };
  return result(await store.typeCommand(user.id, org, op, key, payload));
}
