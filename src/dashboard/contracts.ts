export type DashboardSession = {
  id: string;
  activityId: string;
  name: string;
  location: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  canAttend: boolean;
  canCollect: boolean;
};
export type DashboardReport = {
  generatedAt: string;
  items: DashboardSession[];
};
