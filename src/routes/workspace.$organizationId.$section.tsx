import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import {
  workspaceSections,
  type WorkspaceSection,
} from "../organization/WorkspaceNavigation";
export const Route = createFileRoute("/workspace/$organizationId/$section")({
  beforeLoad: ({ params }) => {
    if (params.section === "overview")
      throw redirect({
        to: "/workspace/$organizationId/$section",
        params: { ...params, section: "settings" },
        replace: true,
      });
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
