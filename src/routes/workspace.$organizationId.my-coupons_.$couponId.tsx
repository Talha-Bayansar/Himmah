import { createFileRoute, notFound } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/my-coupons_/$couponId",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.couponId);
    } catch {
      throw notFound();
    }
  },
  component: Page,
});
function Page() {
  const { organizationId, couponId } = Route.useParams();
  return (
    <OrganizationPortal
      workspaceId={organizationId}
      workspaceSection="my-coupons"
      couponId={couponId}
    />
  );
}
