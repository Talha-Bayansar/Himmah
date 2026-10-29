import type { CashCharge } from "../cash/contracts";
import { CommunityError, uuid } from "../community/contracts.ts";
export const attendanceStatuses = [
  "unmarked",
  "present",
  "absent",
  "excused",
] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];
export type AttendancePerson = {
  billing?: CashCharge | null;
  registered?: boolean;
  expected?: boolean | null;
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
  canEdit: boolean;
  cancelled: boolean;
  startsAt: string;
  paid?: number | null;
  unpaid?: number | null;
  partial?: number | null;
  paymentCount?: number | null;
  expectedMinor?: number | null;
  paidMinor?: number | null;
  outstandingMinor?: number | null;
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
  if ("confirmPoints" in body) throw new CommunityError("invalid_input");
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

export type ParticipantAction = "add" | "remove" | "paid" | "unpaid";
export type ParticipantCommand = {
  key: string;
  action: ParticipantAction;
  items: {
    personId: string;
    version: number;
    paymentVersion?: number;
    sessionVersion?: number;
    amountMinor?: number;
  }[];
};
export function attendanceMembershipInput(
  body: Record<string, unknown>,
): ParticipantCommand {
  if (
    !["add", "remove", "paid", "unpaid"].includes(String(body.action)) ||
    "status" in body ||
    "reason" in body
  )
    throw new CommunityError("invalid_input");
  const source = Array.isArray(body.items)
    ? body.items
    : [{ personId: body.personId, version: body.version }];
  if (source.length < 1 || source.length > 50)
    throw new CommunityError("invalid_input");
  const items = source
    .map((v: Record<string, unknown>) => {
      if (
        !v ||
        !Number.isSafeInteger(v.version) ||
        Number(v.version) < 0 ||
        Number(v.version) > 2147483646
      )
        throw new CommunityError("invalid_input");
      const item: ParticipantCommand["items"][number] = {
        personId: uuid(v.personId),
        version: Number(v.version),
      };
      for (const field of [
        "paymentVersion",
        "sessionVersion",
        "amountMinor",
      ] as const) {
        if (v[field] !== undefined) {
          if (
            !Number.isSafeInteger(v[field]) ||
            Number(v[field]) < 0 ||
            Number(v[field]) > 2147483646
          )
            throw new CommunityError("invalid_input");
          item[field] = Number(v[field]);
        }
      }
      if (
        ["paid", "unpaid"].includes(String(body.action)) &&
        (item.paymentVersion === undefined ||
          item.sessionVersion === undefined ||
          (body.action === "paid" && !item.amountMinor))
      )
        throw new CommunityError("invalid_input");
      return item;
    })
    .sort((a, b) => a.personId.localeCompare(b.personId));
  if (new Set(items.map((v) => v.personId)).size !== items.length)
    throw new CommunityError("invalid_input");
  return {
    key: uuid(body.key),
    action: body.action as ParticipantAction,
    items,
  };
}
