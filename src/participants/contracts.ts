import { CommunityError, uuid } from "../community/contracts.ts";
export type ParticipantSummary = {
  name: string;
  earned: string;
  reserved: string;
  spent: string;
  available: string;
};
export type PersonalPoints = {
  id: string;
  amount: number;
  currentAmount: number;
  source: "manual" | "attendance";
  isAdjustment: boolean;
  createdAt: string;
  occurredAt: string;
};
export type PersonalReward = {
  id: string;
  name: string;
  description: string;
  cost: number;
  inStock: boolean;
  eligible: boolean;
  createdAt: string;
};
export type PersonalRedemption = {
  id: string;
  rewardName: string;
  cost: number;
  status: "pending" | "fulfilled" | "cancelled";
  createdAt: string;
  fulfilledAt: string | null;
  cancelledAt: string | null;
};
export type ParticipantInvitation = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  accepted: boolean;
  consentAttestedAt: string;
};
export type ParticipantAccount = {
  person: { id: string; name: string; archived: boolean };
  link: { id: string; email: string; createdAt: string } | null;
  pending: boolean;
};
export function participantInvitationInput(body: Record<string, unknown>) {
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (
    /[\u0000-\u001f\u007f]/.test(email) ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    throw new CommunityError("invalid_input");
  if (body.consent !== true) throw new CommunityError("participant_consent");
  return { email, key: uuid(body.key), consent: true };
}
