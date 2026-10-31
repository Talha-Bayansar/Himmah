import { CommunityError } from "../community/contracts.ts";
export const followUpPeriods = [7, 30, 60, 90] as const;
export type FollowUpFilters = { days: number; view: "recent" | "never" };
export function followUpFilters(
  values: Record<string, unknown>,
): FollowUpFilters {
  const days = Number(values.days ?? 30),
    view = values.view ?? "recent";
  if (
    !(followUpPeriods as readonly number[]).includes(days) ||
    (view !== "recent" && view !== "never")
  )
    throw new CommunityError("invalid_input");
  return { days, view };
}
export type FollowUpContact = {
  id: string;
  name: string;
  createdAt: string;
  lastVisit: string | null;
  lastTopic: string | null;
  lastActivity: string | null;
};
export type FollowUpReport = {
  items: FollowUpContact[];
  nextCursor: string | null;
  generatedAt: string;
  since: string;
  timezone: string;
  summary: { recent: number; never: number };
};
