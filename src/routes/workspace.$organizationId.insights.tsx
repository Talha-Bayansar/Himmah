import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/workspace/$organizationId/insights")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s.from === "string" ? s.from.slice(0, 10) : "",
    to: typeof s.to === "string" ? s.to.slice(0, 10) : "",
    activity: typeof s.activity === "string" ? s.activity.slice(0, 36) : "",
    group: typeof s.group === "string" ? s.group.slice(0, 36) : "",
    bucket: s.bucket === "month" ? ("month" as const) : ("week" as const),
  }),
  component: () => (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={Route.useParams().organizationId}
      workspaceSection="insights"
    />
  ),
});
