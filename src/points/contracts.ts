import { CommunityError, uuid } from "../community/contracts.ts";
import { zonedInstant } from "../activities/contracts.ts";
export type PointsEntry = {
  id: string;
  personId: string;
  amount: number;
  reason: string;
  occurredAt: string;
  createdAt: string;
  actorName: string | null;
  originalReason: string | null;
  originalId: string | null;
  activityId: string | null;
  sessionId: string | null;
  activityName: string | null;
  sessionName: string | null;
  currentAmount: number;
  version: number;
};
export type PointsInput = {
  key: string;
  kind: "award" | "correct";
  people: string[];
  amount: number;
  reason: string;
  occurredAt: string | null;
  activityId: string | null;
  sessionId: string | null;
  originalId: string | null;
  version: number | null;
};
export type PointsResult = {
  items: {
    personId: string;
    name: string;
    outcome: "saved" | "ineligible" | "conflict" | "unchanged";
  }[];
};
export function pointsInput(
  body: Record<string, unknown>,
  timezone: string,
  now = Date.now(),
): PointsInput {
  const kind = body.kind;
  if (kind !== "award" && kind !== "correct")
    throw new CommunityError("invalid_input");
  if (
    !Array.isArray(body.people) ||
    body.people.length < 1 ||
    body.people.length > 50
  )
    throw new CommunityError("invalid_input");
  const people = body.people.map((id) => uuid(id).toLowerCase()).sort();
  if (new Set(people).size !== people.length)
    throw new CommunityError("invalid_input");
  if (
    !Number.isSafeInteger(body.amount) ||
    Number(body.amount) < (kind === "award" ? 1 : 0) ||
    Number(body.amount) > 10000
  )
    throw new CommunityError("points_amount");
  if (
    typeof body.reason !== "string" ||
    !body.reason.trim() ||
    body.reason.trim().length > 300 ||
    /[\u0000-\u001f]/.test(body.reason)
  )
    throw new CommunityError("points_reason");
  const activityId =
    body.activityId == null ? null : uuid(body.activityId).toLowerCase();
  const sessionId =
    body.sessionId == null ? null : uuid(body.sessionId).toLowerCase();
  if (sessionId && !activityId) throw new CommunityError("invalid_input");
  let occurredAt: string | null = null,
    originalId: string | null = null,
    version: number | null = null;
  if (kind === "award") {
    occurredAt = zonedInstant(body.occurredLocal, timezone);
    if (
      Date.parse(occurredAt) > now ||
      Date.parse(occurredAt) < Date.parse("2000-01-01T00:00Z")
    )
      throw new CommunityError("points_date");
  } else {
    originalId = uuid(body.originalId).toLowerCase();
    if (
      people.length !== 1 ||
      !Number.isSafeInteger(body.version) ||
      Number(body.version) < 1 ||
      Number(body.version) >= 2147483647
    )
      throw new CommunityError("invalid_input");
    version = Number(body.version);
    if (activityId || sessionId) throw new CommunityError("invalid_input");
  }
  return {
    key: uuid(body.key).toLowerCase(),
    kind,
    people,
    amount: Number(body.amount),
    reason: body.reason.trim(),
    occurredAt,
    activityId,
    sessionId,
    originalId,
    version,
  };
}
