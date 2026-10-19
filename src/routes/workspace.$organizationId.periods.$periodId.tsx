import { createFileRoute, notFound } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/periods/$periodId",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.periodId);
    } catch {
      throw notFound();
    }
  },
  validateSearch: (
    value: Record<string, unknown>,
  ): { view: "members" | "groups"; group?: string } => {
    const view = value.view === "groups" ? "groups" : "members";
    try {
      const group = value.group ? uuid(value.group) : undefined;
      return group ? { view: "members", group } : { view };
    } catch {
      throw notFound();
    }
  },
  component: PeriodPage,
});
function PeriodPage() {
  const { organizationId, periodId } = Route.useParams();
  const { view, group } = Route.useSearch();
  return (
    <OrganizationPortal
      workspaceId={organizationId}
      workspaceSection="periods"
      periodId={periodId}
      periodView={view}
      periodGroupId={group ?? null}
    />
  );
}
