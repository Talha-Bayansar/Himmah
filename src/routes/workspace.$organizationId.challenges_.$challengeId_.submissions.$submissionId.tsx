import { createFileRoute, notFound } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/challenges_/$challengeId_/submissions/$submissionId",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.challengeId);
      uuid(params.submissionId);
    } catch {
      throw notFound();
    }
  },
  component: Page,
});
function Page() {
  const { organizationId, challengeId, submissionId } = Route.useParams();
  return (
    <OrganizationPortal
      workspaceId={organizationId}
      workspaceSection="challenges"
      challengeId={challengeId}
      challengeSubmissionId={submissionId}
    />
  );
}
