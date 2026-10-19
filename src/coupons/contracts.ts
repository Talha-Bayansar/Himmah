import { CommunityError } from "../community/contracts.ts";
export type Coupon = {
  id: string;
  rewardName: string;
  cost: number;
  status: "pending" | "fulfilled" | "cancelled";
  version: number;
  createdAt: string;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  code?: string | null;
  personName?: string;
  canCollect?: boolean;
};
export function couponCode(input: string, org: string, origin: string) {
  const value = input.trim();
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CommunityError("coupon_invalid");
  }
  const path = url.pathname.match(/^\/workspace\/([0-9a-f-]{36})\/collect$/i);
  if (
    url.origin !== origin ||
    url.search ||
    !path ||
    !/^#[0-9a-f]{64}$/i.test(url.hash)
  )
    throw new CommunityError("coupon_invalid");
  if (path[1]!.toLowerCase() !== org.toLowerCase())
    throw new CommunityError("coupon_org");
  return url.hash.slice(1).toLowerCase();
}
