import { createFileRoute, notFound } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/members/$memberId_/account",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.memberId);
    } catch {
      throw notFound();
    }
  },
  validateSearch: (
    value: Record<string, unknown>,
  ): { view: "invitations" | "history" } => ({
    view: value.view === "history" ? "history" : "invitations",
  }),
  component: AccountPage,
});
function AccountPage() {
  const { organizationId, memberId } = Route.useParams(),
    { view } = Route.useSearch();
  return (
    <OrganizationPortal
      workspaceId={organizationId}
      workspaceSection="members"
      memberId={memberId}
      participantAccount
      participantAccountView={view}
    />
  );
}
