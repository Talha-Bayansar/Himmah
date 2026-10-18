import { createFileRoute, notFound } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/groups/$groupId",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.groupId);
    } catch {
      throw notFound();
    }
  },
  component: GroupPage,
});
function GroupPage() {
  const { organizationId, groupId } = Route.useParams();
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection="groups"
      groupId={groupId}
    />
  );
}
