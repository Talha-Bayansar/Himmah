import { pageInput, pageResult } from "../../community/contracts.ts";
import {
  uuid,
  expectedVersion,
  reasonInput,
  communicationInput,
  PeopleError,
} from "./contracts.ts";
import type { PeopleStore } from "./store.ts";
export async function communicationApi(
  request: Request,
  user: { id: string },
  store: PeopleStore,
  org: string,
  parts: string[],
  body: () => Promise<Record<string, unknown>>,
) {
  const [, rawId, child, rawChildId] = parts;
  if (
    parts[0] !== "contacts" ||
    !rawId ||
    !["communication", "communication-preferences", "routing"].includes(
      child ?? "",
    )
  )
    return null;
  const id = uuid(rawId);
  if (!(await store.get(user.id, org, id)))
    return { value: { code: "not_found_or_forbidden" }, status: 404 };
  if (request.method === "GET" && !rawChildId) {
    if (child === "routing")
      return { value: await store.contactRouting(user.id, org, id) };
    if (child === "communication") {
      const url = new URL(request.url),
        h = url.searchParams.get("history");
      if (h !== null && !["true", "false"].includes(h))
        throw new PeopleError("invalid_input");
      const p = pageInput(
        url,
        JSON.stringify(["communication-v1", user.id, org, id, h === "true"]),
      );
      const { rows, total } = await store.communicationAssignments(
        user.id,
        org,
        id,
        p,
        h === "true",
      );
      return { value: { ...pageResult(rows, p), total } };
    }
  }
  let operation: string, payload: Record<string, unknown>;
  if (
    child === "communication-preferences" &&
    request.method === "PATCH" &&
    !rawChildId
  ) {
    const b = await body();
    if (
      typeof b.routineDirectAllowed !== "boolean" ||
      typeof b.emergencyDirectAllowed !== "boolean"
    )
      throw new PeopleError("invalid_input");
    operation = "communication_preferences";
    payload = {
      contactId: id,
      version: expectedVersion(b.version),
      routineDirectAllowed: b.routineDirectAllowed,
      emergencyDirectAllowed: b.emergencyDirectAllowed,
    };
    const r = await store.communicationCommand(
      user.id,
      org,
      operation,
      uuid(b.requestKey),
      payload,
    );
    return result(r);
  }
  if (
    child !== "communication" ||
    !(
      (request.method === "POST" && !rawChildId) ||
      (request.method === "DELETE" && rawChildId)
    )
  )
    return { value: { code: "invalid_input" }, status: 405 };
  const b = await body();
  if (request.method === "POST") {
    operation = "add_communication";
    payload = {
      contactId: id,
      version: expectedVersion(b.version),
      ...communicationInput(b),
    };
  } else {
    operation = "end_communication";
    payload = {
      contactId: id,
      version: expectedVersion(b.version),
      assignmentId: uuid(rawChildId),
      assignmentVersion: expectedVersion(b.assignmentVersion),
      reason: reasonInput(b.reason),
    };
  }
  return result(
    await store.communicationCommand(
      user.id,
      org,
      operation,
      uuid(b.requestKey),
      payload,
    ),
  );
}
function result(r: { code?: string }) {
  return r.code
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
}
