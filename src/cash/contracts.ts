import { CommunityError, uuid, versionInput } from "../community/contracts.ts";
export const cashViews = [
  "all",
  "not_charged",
  "participants",
  "outstanding",
  "unpaid",
  "partial",
  "paid",
  "review",
  "history",
] as const;
export type CashView = (typeof cashViews)[number];
export type CashCharge = {
  personId?: string;
  contactVersion?: number;
  sessionVersion?: number;
  canCharge?: boolean;
  registrationRequired?: boolean;
  id: string;
  name: string;
  amountMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  version: number;
  status: "unpaid" | "partial" | "paid" | "not_charged";
  reviewRequired: boolean;
  createdAt: string;
};
export type CashReceipt = {
  id: string;
  amountMinor: number;
  unallocatedMinor: number;
  payerLabel: string;
  collectorName: string | null;
  occurredAt: string;
  createdAt: string;
  reversed: boolean;
  correctedMinor?: number;
  reason: string | null;
  reversedAt?: string | null;
  reversedBy?: string | null;
  allocations: { name: string; amountMinor: number; corrected?: boolean }[];
};
export type CashSummary = {
  topic?: string;
  name: string;
  timezone: string;
  toChargeCount?: number;
  canManage: boolean;
  canRecord: boolean;
  owedMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  collectedMinor: number | null;
  unallocatedMinor: number | null;
};
export function cashInput(body: Record<string, unknown>, timezone: string) {
  const key = uuid(body.key);
  if (body.action === "charge")
    return {
      key,
      payload: {
        action: "charge",
        personId: uuid(body.personId),
        contactVersion: versionInput({ version: body.contactVersion }),
        sessionVersion: versionInput({ version: body.sessionVersion }),
      },
    };
  if (body.action === "reverse") {
    if (
      typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.trim().length > 300
    )
      throw new CommunityError("cash_reason");
    return {
      key,
      payload: {
        action: "reverse",
        receiptId: uuid(body.receiptId),
        reason: body.reason.trim(),
      },
    };
  }
  if (
    body.action !== "record" ||
    !Number.isSafeInteger(body.amountMinor) ||
    Number(body.amountMinor) < 1 ||
    Number(body.amountMinor) > 100000000 ||
    !Array.isArray(body.allocations) ||
    body.allocations.length < 1 ||
    body.allocations.length > 50 ||
    typeof body.payerLabel !== "string" ||
    body.payerLabel.trim().length > 100 ||
    /[\u0000-\u001f]/.test(body.payerLabel)
  )
    throw new CommunityError("invalid_input");
  const allocations = body.allocations
    .map((v: unknown) => {
      if (!v || typeof v !== "object")
        throw new CommunityError("invalid_input");
      const a = v as Record<string, unknown>;
      if (
        !Number.isSafeInteger(a.amountMinor) ||
        Number(a.amountMinor) < 1 ||
        Number(a.amountMinor) > 100000000
      )
        throw new CommunityError("cash_allocation");
      if (a.chargeId !== undefined)
        return {
          chargeId: uuid(a.chargeId),
          version: versionInput(a),
          amountMinor: Number(a.amountMinor),
        };
      if (a.version !== 0) throw new CommunityError("invalid_input");
      return {
        personId: uuid(a.personId),
        contactVersion: versionInput({ version: a.contactVersion }),
        sessionVersion: versionInput({ version: a.sessionVersion }),
        version: 0,
        amountMinor: Number(a.amountMinor),
      };
    })
    .sort((a, b) =>
      (a.chargeId ?? a.personId!).localeCompare(b.chargeId ?? b.personId!),
    );
  if (
    new Set(allocations.map((a) => a.chargeId ?? a.personId)).size !==
      allocations.length ||
    allocations.reduce((sum, a) => sum + a.amountMinor, 0) >
      Number(body.amountMinor)
  )
    throw new CommunityError("cash_allocation");
  if (
    typeof body.occurredAt !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body.occurredAt) ||
    !Number.isFinite(Date.parse(body.occurredAt)) ||
    new Date(body.occurredAt).toISOString() !== body.occurredAt ||
    Date.parse(body.occurredAt) > Date.now() + 300000
  )
    throw new CommunityError("cash_time");
  void timezone;
  return {
    key,
    payload: {
      action: "record",
      amountMinor: Number(body.amountMinor),
      payerLabel: body.payerLabel.trim(),
      occurredAt: new Date(body.occurredAt).toISOString(),
      allocations,
    },
  };
}
