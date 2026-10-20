import { createFileRoute, notFound } from "@tanstack/react-router";
import { uuid } from "../community/contracts";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute(
  "/futsal/$organizationId_/seasons/$seasonId_/competition",
)({
  validateSearch: (v: Record<string, unknown>): { club?: string } => {
    try {
      return v.club ? { club: uuid(v.club) } : {};
    } catch {
      return {};
    }
  },
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
      futsal={{ page: "competition", clubId: Route.useSearch().club, seasonId }}
    />
  );
}
