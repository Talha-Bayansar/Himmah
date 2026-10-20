import { createFileRoute, notFound } from "@tanstack/react-router";
import { uuid } from "../community/contracts";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/futsal/$organizationId_/seasons/new")({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.organizationId);
    } catch {
      throw notFound();
    }
  },
  component: Page,
});
function Page() {
  const { organizationId } = Route.useParams();
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection="apps"
      futsal={{ page: "new" }}
    />
  );
}
