import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute(
  "/workspace/$organizationId/learning/$learningId/live",
)({
  validateSearch: (s: Record<string, unknown>) => ({
    ...(typeof s.room === "string" && /^[0-9a-f-]{36}$/i.test(s.room)
      ? { room: s.room }
      : {}),
  }),
  component: () => (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={Route.useParams().organizationId}
      workspaceSection="learning"
      learningId={Route.useParams().learningId}
      learningMode="live"
    />
  ),
});
