import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute(
  "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance",
)({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    q: typeof s.q === "string" ? s.q.slice(0, 80) : "",
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
