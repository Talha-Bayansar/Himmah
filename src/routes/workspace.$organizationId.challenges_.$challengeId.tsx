import { createFileRoute, notFound } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/challenges_/$challengeId",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.challengeId);
    } catch {
      throw notFound();
    }
  },
  component: Page,
});
function Page() {
  const { organizationId, challengeId } = Route.useParams();
  return (
    <OrganizationPortal
      workspaceId={organizationId}
      workspaceSection="challenges"
      challengeId={challengeId}
    />
  );
}
