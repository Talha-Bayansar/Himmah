import {
  createFileRoute,
  notFound,
  Outlet,
  useChildMatches,
} from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/activities/$activityId/sessions/$sessionId",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.activityId);
      uuid(params.sessionId);
    } catch {
      throw notFound();
    }
  },
  component: SessionPage,
});
function SessionPage() {
  const { organizationId, activityId, sessionId } = Route.useParams();
  const children = useChildMatches();
  if (children.length) return <Outlet />;
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection="activities"
      activityId={activityId}
      sessionId={sessionId}
    />
  );
}
