import { CommunityError, nameInput, uuid } from "../community/contracts.ts";
import { zonedInstant } from "../activities/contracts.ts";
export type Challenge = {
  id: string;
  name: string;
  description: string;
  points: number;
  startsAt: string | null;
  endsAt: string | null;
  status: "draft" | "published" | "archived";
  version: number;
  createdAt: string;
  groups: { id: string; name: string; archived: boolean }[];
  eligible: boolean;
  open: boolean;
  submission: Submission | null;
};
export type Submission = {
  id: string;
  challengeId: string;
  challengeName: string;
  personName?: string;
  points: number;
  currentPoints?: number;
  challengeVersion: number;
  note: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  version: number;
  createdAt: string;
  submittedAt: string;
  reviewedAt: string | null;
  feedback: string;
  entryId?: string | null;
  personId?: string;
  canReview?: boolean;
};
export type Candidate = {
  id: string;
  name: string;
  createdAt: string;
  submissionVersion: number | null;
};
export function challengeInput(
  body: Record<string, unknown>,
  timezone: string,
) {
  const name = nameInput(body);
  if (
    typeof body.description !== "string" ||
    body.description.trim().length < 1 ||
    body.description.length > 2000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.description) ||
    !Number.isInteger(body.points) ||
    Number(body.points) < 1 ||
    Number(body.points) > 10000 ||
    !Array.isArray(body.groups) ||
    body.groups.length > 50
  )
    throw new CommunityError("invalid_input");
  const groups = [...new Set(body.groups.map(uuid))].sort();
  const startsAt = body.startsAt ? zonedInstant(body.startsAt, timezone) : null,
    endsAt = body.endsAt ? zonedInstant(body.endsAt, timezone) : null;
  if (startsAt && endsAt && endsAt <= startsAt)
    throw new CommunityError("activity_time");
  return {
    name,
    description: body.description.trim(),
    points: Number(body.points),
    groups,
    startsAt,
    endsAt,
  };
}
export function challengeNote(value: unknown, max = 500, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new CommunityError("invalid_input");
  return value.trim();
}
