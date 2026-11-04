import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { exportSearch } from "../exports/contracts";
export const Route = createFileRoute("/workspace/$organizationId/exports")({
  validateSearch: exportSearch,
  component: () => (
    <OrganizationPortal
      workspaceId={Route.useParams().organizationId}
      workspaceSection="exports"
    />
  ),
});
