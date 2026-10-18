import { createFileRoute, notFound } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/activities/$activityId",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.activityId);
    } catch {
      throw notFound();
    }
  },
  component: ActivityPage,
});
function ActivityPage() {
  const { organizationId, activityId } = Route.useParams();
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection="activities"
      activityId={activityId}
    />
  );
}
