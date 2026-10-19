import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/workspace/$organizationId/challenges")({
  validateSearch: (
    v: Record<string, unknown>,
  ): {
    view:
      "available" | "history" | "draft" | "published" | "archived" | undefined;
  } => ({
    view: ["available", "history", "draft", "published", "archived"].includes(
      String(v.view),
    )
      ? (v.view as "available" | "history" | "draft" | "published" | "archived")
      : undefined,
  }),
  component: Page,
});
function Page() {
  const { organizationId } = Route.useParams(),
    { view } = Route.useSearch();
  return (
    <OrganizationPortal
      workspaceId={organizationId}
      workspaceSection="challenges"
      challengeView={view}
    />
  );
}
