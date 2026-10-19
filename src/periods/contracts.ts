import { CommunityError, nameInput } from "../community/contracts.ts";
export type EngagementPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  timezone: string;
  version: number;
  closedAt: string | null;
  createdAt: string;
};
export type PeriodMember = {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  points: string;
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
};
export type PeriodGroup = {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  members: number;
  points: string;
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
};
export type PeriodSummary = {
  members: number;
  points: string;
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
};
export function periodInput(body: Record<string, unknown>) {
  const name = nameInput(body);
  const date = (value: unknown) => {
    if (
      typeof value !== "string" ||
      !/^20\d{2}-\d{2}-\d{2}$|^2100-\d{2}-\d{2}$/.test(value)
    )
      throw new CommunityError("period_dates");
    const parsed = new Date(value + "T00:00:00Z");
    if (
      !Number.isFinite(+parsed) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      throw new CommunityError("period_dates");
    return value;
  };
  const startDate = date(body.startDate),
    endDate = date(body.endDate);
  if (endDate < startDate) throw new CommunityError("period_dates");
  return { name, startDate, endDate };
}
