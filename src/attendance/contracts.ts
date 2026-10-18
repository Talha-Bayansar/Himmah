import { CommunityError, uuid } from "../community/contracts.ts";
export const attendanceStatuses = [
  "unmarked",
  "present",
  "absent",
  "excused",
] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];
export type AttendancePerson = {
  id: string;
  name: string;
  createdAt: string;
  archived: boolean;
  eligible: boolean;
  status: AttendanceStatus;
  version: number;
};
export type AttendanceSummary = {
  total: number;
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
  canEdit: boolean;
  cancelled: boolean;
  startsAt: string;
};
export type AttendanceChange = {
  id: string;
  createdAt: string;
  beforeStatus: AttendanceStatus;
  afterStatus: AttendanceStatus;
  reason: string;
  actorName: string | null;
  version: number;
};
export type AttendanceItemResult = {
  personId: string;
  outcome:
    "saved" | "unchanged" | "conflict" | "ineligible" | "reason_required";
  status?: AttendanceStatus;
  version?: number;
};
export type AttendanceResult = { items: AttendanceItemResult[] };
export type AttendanceInput = {
  key: string;
  status: AttendanceStatus;
  reason: string;
  items: { personId: string; version: number }[];
};
export function attendanceInput(
  body: Record<string, unknown>,
): AttendanceInput {
  const key = uuid(body.key).toLowerCase();
  if (
    !attendanceStatuses.includes(body.status as AttendanceStatus) ||
    typeof body.reason !== "string" ||
    body.reason.trim().length > 300 ||
    /[\u0000-\u001f]/.test(body.reason)
  )
    throw new CommunityError("invalid_input");
  if (
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 50
  )
    throw new CommunityError("invalid_input");
  const items = body.items
    .map((value) => {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !Number.isSafeInteger(value.version) ||
        value.version < 0 ||
        value.version > 2147483646
      )
        throw new CommunityError("invalid_input");
      return {
        personId: uuid(value.personId).toLowerCase(),
        version: Number(value.version),
      };
    })
    .sort((a, b) => a.personId.localeCompare(b.personId));
  if (new Set(items.map((item) => item.personId)).size !== items.length)
    throw new CommunityError("invalid_input");
  return {
    key,
    status: body.status as AttendanceStatus,
    reason: body.reason.trim(),
    items,
  };
}
