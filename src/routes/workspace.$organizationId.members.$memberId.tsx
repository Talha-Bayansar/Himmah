import { createFileRoute, notFound } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/members/$memberId",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.memberId);
    } catch {
      throw notFound();
    }
  },
  component: MemberPage,
});
function MemberPage() {
  const { organizationId, memberId } = Route.useParams();
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection="members"
      memberId={memberId}
    />
  );
}
