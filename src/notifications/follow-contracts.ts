import { CommunityError, uuid } from "../community/contracts.ts";
export type FollowState = {
  following: boolean;
  reminderMinutes: 0 | 60;
  version: number;
  source: "own" | "activity" | "none";
  canFollow: boolean;
};
export type FollowCommand = {
  key: string;
  following: boolean;
  reminderMinutes: 0 | 60;
  version: number;
};
export function followInput(raw: unknown): FollowCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new CommunityError("invalid_input");
  const body = raw as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (k) => !["key", "following", "reminderMinutes", "version"].includes(k),
    ) ||
    typeof body.following !== "boolean" ||
    ![0, 60].includes(body.reminderMinutes as number) ||
    !Number.isSafeInteger(body.version) ||
    Number(body.version) < 0 ||
    Number(body.version) > 2147483646
  )
    throw new CommunityError("invalid_input");
  return {
    key: uuid(body.key),
    following: body.following,
    reminderMinutes: body.reminderMinutes as 0 | 60,
    version: Number(body.version),
  };
}
