import { CommunityError, uuid } from "../community/contracts.ts";
export type AccessAssignment = {
  effective?: boolean;
  id: string;
  userId: string;
  staffName: string;
  scopeName: string;
  groupId: string | null;
  activityId: string | null;
  canAttend: boolean;
  canCollect?: boolean;
  version: number;
  createdAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
};
export function accessInput(body: Record<string, unknown>, create: boolean) {
  if ("canAward" in body) throw new CommunityError("invalid_input");
  if (
    typeof body.canAttend !== "boolean" ||
    (body.canCollect !== undefined && typeof body.canCollect !== "boolean") ||
    (!body.canAttend && !body.canCollect)
  )
    throw new CommunityError("access_capabilities");
  if (!create)
    return { canAttend: body.canAttend, canCollect: body.canCollect === true };
  if (
    typeof body.userId !== "string" ||
    body.userId.length < 1 ||
    body.userId.length > 128 ||
    /[\u0000-\u001f]/.test(body.userId)
  )
    throw new CommunityError("invalid_input");
  const groupId = body.groupId == null ? null : uuid(body.groupId),
    activityId = body.activityId == null ? null : uuid(body.activityId);
  if ((groupId === null) === (activityId === null))
    throw new CommunityError("invalid_input");
  return {
    userId: body.userId,
    groupId,
    activityId,
    canAttend: body.canAttend,
    canCollect: body.canCollect === true,
  };
}
