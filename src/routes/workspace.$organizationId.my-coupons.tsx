import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/workspace/$organizationId/my-coupons")({
  validateSearch: (
    v: Record<string, unknown>,
  ): { status: "pending" | "all" } => ({
    status: v.status === "all" ? "all" : "pending",
  }),
  component: Page,
});
function Page() {
  const { organizationId } = Route.useParams(),
    { status } = Route.useSearch();
  return (
    <OrganizationPortal
      workspaceId={organizationId}
      workspaceSection="my-coupons"
      couponStatus={status}
    />
  );
}
