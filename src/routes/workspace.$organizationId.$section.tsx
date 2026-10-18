import { createFileRoute, notFound } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import {
  workspaceSections,
  type WorkspaceSection,
} from "../organization/WorkspaceNavigation";
export const Route = createFileRoute("/workspace/$organizationId/$section")({
  beforeLoad: ({ params }) => {
    if (!workspaceSections.includes(params.section as WorkspaceSection))
      throw notFound();
  },
  component: WorkspacePage,
});
function WorkspacePage() {
  const { organizationId, section } = Route.useParams();
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection={section as WorkspaceSection}
    />
  );
}
