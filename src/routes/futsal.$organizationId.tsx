import { createFileRoute, notFound } from "@tanstack/react-router";
import { uuid } from "../community/contracts";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/futsal/$organizationId")({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.organizationId);
    } catch {
      throw notFound();
    }
  },
  validateSearch: (
    v: Record<string, unknown>,
  ): { status?: "all" | "draft" | "prepared" | "cancelled" } => ({
    status: ["all", "draft", "prepared", "cancelled"].includes(String(v.status))
      ? (v.status as "all" | "draft" | "prepared" | "cancelled")
      : "all",
  }),
  component: Page,
});
function Page() {
  const { organizationId } = Route.useParams(),
    { status } = Route.useSearch();
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection="apps"
      futsal={{ page: "seasons", status: status ?? "all" }}
    />
  );
}
