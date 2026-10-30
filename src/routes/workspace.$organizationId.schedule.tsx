import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/workspace/$organizationId/schedule")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q.slice(0, 80) : "",
  }),
  component: () => (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={Route.useParams().organizationId}
      workspaceSection="schedule"
    />
  ),
});
