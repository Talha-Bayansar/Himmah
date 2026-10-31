import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/workspace/$organizationId/learning/")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q.slice(0, 80) : "",
    activity:
      typeof s.activity === "string" && /^[0-9a-f-]{36}$/i.test(s.activity)
        ? s.activity
        : "",
    session:
      typeof s.session === "string" && /^[0-9a-f-]{36}$/i.test(s.session)
        ? s.session
        : "",
  }),
  component: () => (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={Route.useParams().organizationId}
      workspaceSection="learning"
    />
  ),
});
