import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/workspace/$organizationId/follow-up")({
  validateSearch: (s: Record<string, unknown>) => ({
    days: [7, 30, 60, 90].includes(Number(s.days)) ? Number(s.days) : 30,
    view: s.view === "never" ? ("never" as const) : ("recent" as const),
    q: typeof s.q === "string" ? s.q.slice(0, 80) : "",
  }),
  component: () => (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={Route.useParams().organizationId}
      workspaceSection="follow-up"
    />
  ),
});
