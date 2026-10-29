import { CommunityError, uuid, versionInput } from "../community/contracts.ts";
export const cashViews = [
  "all",
  "outstanding",
  "unpaid",
  "partial",
  "paid",
  "review",
  "history",
] as const;
export type CashView = (typeof cashViews)[number];
export type CashCharge = {
  id: string;
  name: string;
  amountMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  version: number;
  status: "unpaid" | "partial" | "paid";
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
  reason: string | null;
  reversedAt?: string | null;
  reversedBy?: string | null;
  allocations: { name: string; amountMinor: number }[];
};
export type CashSummary = {
  name: string;
  timezone: string;
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
      return {
        chargeId: uuid(a.chargeId),
        version: versionInput(a),
        amountMinor: Number(a.amountMinor),
      };
    })
    .sort((a, b) => a.chargeId.localeCompare(b.chargeId));
  if (
    new Set(allocations.map((a) => a.chargeId)).size !== allocations.length ||
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
