import { CommunityError, nameInput } from "../community/contracts.ts";
export type Reward = {
  id: string;
  name: string;
  description: string;
  cost: number;
  stock: number | null;
  used: number;
  archived: boolean;
  version: number;
  createdAt: string;
};
export type RewardMember = {
  id: string;
  name: string;
  createdAt: string;
  earned: string;
  reserved: string;
  spent: string;
  available: string;
  eligible: boolean;
};
export type Redemption = {
  id: string;
  rewardId: string;
  personId: string;
  rewardName: string;
  personName: string;
  cost: number;
  status: "pending" | "fulfilled" | "cancelled";
  version: number;
  createdAt: string;
  createdByName: string;
  fulfilledAt: string | null;
  fulfilledByName: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
};
export function rewardInput(body: Record<string, unknown>) {
  const name = nameInput(body);
  if (
    typeof body.description !== "string" ||
    body.description.trim().length > 1000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.description)
  )
    throw new CommunityError("invalid_input");
  if (
    !Number.isInteger(body.cost) ||
    Number(body.cost) < 1 ||
    Number(body.cost) > 1000000
  )
    throw new CommunityError("reward_cost");
  if (
    body.stock !== null &&
    (!Number.isInteger(body.stock) ||
      Number(body.stock) < 0 ||
      Number(body.stock) > 1000000)
  )
    throw new CommunityError("reward_stock");
  return {
    name,
    description: body.description.trim(),
    cost: body.cost as number,
    stock: body.stock as number | null,
  };
}
