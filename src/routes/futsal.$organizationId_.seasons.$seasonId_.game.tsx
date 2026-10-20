import { createFileRoute, notFound } from "@tanstack/react-router";
import { uuid } from "../community/contracts";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute(
  "/futsal/$organizationId_/seasons/$seasonId_/game",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.organizationId);
      uuid(params.seasonId);
    } catch {
      throw notFound();
    }
  },
  component: Page,
});
function Page() {
  const { organizationId, seasonId } = Route.useParams();
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection="apps"
      futsal={{ page: "game", seasonId }}
    />
  );
}
