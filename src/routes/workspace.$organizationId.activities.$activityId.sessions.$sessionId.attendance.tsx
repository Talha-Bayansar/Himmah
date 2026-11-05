import { createFileRoute } from "@tanstack/react-router";
import { cashViews, type CashView } from "../cash/contracts";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute(
  "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance",
)({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    q?: string;
    cashView?: CashView;
    checkIn?: boolean;
    source?: "suggested" | "all";
    checkInQuery?: string;
  } => ({
    checkIn: s.checkIn === true || s.checkIn === "true",
    source: s.source === "all" ? "all" : "suggested",
    checkInQuery:
      typeof s.checkInQuery === "string" ? s.checkInQuery.slice(0, 80) : "",
    q: typeof s.q === "string" ? s.q.slice(0, 80) : "",
    ...(cashViews.includes(s.cashView as CashView)
      ? { cashView: s.cashView as CashView }
      : {}),
  }),
  component: AttendancePage,
});
function AttendancePage() {
  const { organizationId, activityId, sessionId } = Route.useParams();
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection="activities"
      activityId={activityId}
      sessionId={sessionId}
      attendance
    />
  );
}
