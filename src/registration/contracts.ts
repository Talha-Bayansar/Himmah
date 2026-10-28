import { CommunityError, uuid, versionInput } from "../community/contracts.ts";
export const registrationViews = [
  "confirmed",
  "cancelled",
  "expected",
  "original",
  "history",
] as const;
export type RegistrationView = (typeof registrationViews)[number];
export type RegistrationSummary = {
  mode: "open" | "required";
  capacity: number | null;
  version: number;
  confirmed: number;
  remaining: number | null;
  expected: number | null;
  originalExpected: number | null;
  frozenAt: string | null;
  checkInOpensAt: string;
  canManage: boolean;
  canConfigure: boolean;
  canRegister: boolean;
  cancelled: boolean;
};
export type RegistrationRow = {
  id: string;
  personId: string;
  name: string;
  status: "confirmed" | "cancelled";
  source: "advance" | "walk_in";
  version: number;
  createdAt: string;
  initial: boolean | null;
  included: boolean | null;
};
export type RegistrationOption = {
  id: string;
  name: string;
  contactVersion: number;
  version: number;
  createdAt: string;
};
export type RegistrationEvent = {
  id: string;
  name: string | null;
  action: "register" | "cancel" | "configure" | "freeze";
  reason: string;
  createdAt: string;
  actorName: string | null;
};
export function registrationInput(body: Record<string, unknown>) {
  const action = body.action,
    key = uuid(body.key);
  const version = body.version;
  if (
    !Number.isSafeInteger(version) ||
    Number(version) < 0 ||
    Number(version) >= 2147483647
  )
    throw new CommunityError("invalid_input");
  if (action === "configure") {
    if (body.mode !== "open" && body.mode !== "required")
      throw new CommunityError("invalid_input");
    const capacity = body.capacity;
    if (
      capacity !== null &&
      (!Number.isSafeInteger(capacity) ||
        Number(capacity) < 1 ||
        Number(capacity) > 100000)
    )
      throw new CommunityError("invalid_input");
    return { key, payload: { action, version, mode: body.mode, capacity } };
  }
  if (action !== "register" && action !== "cancel")
    throw new CommunityError("invalid_input");
  const personId = uuid(body.personId),
    reason = body.reason;
  if (
    typeof reason !== "string" ||
    reason.trim().length > 300 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(reason)
  )
    throw new CommunityError("invalid_input");
  if (action === "cancel" && !reason.trim())
    throw new CommunityError("registration_reason");
  return {
    key,
    payload: {
      action,
      personId,
      version,
      reason: reason.trim(),
      ...(action === "register"
        ? { contactVersion: versionInput({ version: body.contactVersion }) }
        : {}),
    },
  };
}
