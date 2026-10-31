import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute(
  "/workspace/$organizationId/learning/$learningId/",
)({
  component: () => (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={Route.useParams().organizationId}
      workspaceSection="learning"
      learningId={Route.useParams().learningId}
    />
  ),
});
