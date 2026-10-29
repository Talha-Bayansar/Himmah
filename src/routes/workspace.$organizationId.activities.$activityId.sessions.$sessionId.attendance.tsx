import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute(
  "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance",
)({
  validateSearch: (
    s: Record<string, unknown>,
  ): { q?: string; status?: string; roster?: string } => ({
    q: typeof s.q === "string" ? s.q.slice(0, 80) : "",
    status: ["all", "present", "absent", "excused", "unmarked"].includes(
      String(s.status),
    )
      ? String(s.status)
      : "all",
    roster: ["all", "registered", "expected"].includes(String(s.roster))
      ? String(s.roster)
      : "all",
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
