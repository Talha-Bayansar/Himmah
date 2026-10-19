import { createFileRoute, notFound } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/rewards/$rewardId",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.rewardId);
    } catch {
      throw notFound();
    }
  },
  validateSearch: (
    value: Record<string, unknown>,
  ): { view: "members" | "redemptions" } => ({
    view: value.view === "redemptions" ? "redemptions" : "members",
  }),
  component: RewardPage,
});
function RewardPage() {
  const { organizationId, rewardId } = Route.useParams();
  const { view } = Route.useSearch();
  return (
    <OrganizationPortal
      workspaceId={organizationId}
      workspaceSection="rewards"
      rewardId={rewardId}
      rewardView={view}
    />
  );
}
