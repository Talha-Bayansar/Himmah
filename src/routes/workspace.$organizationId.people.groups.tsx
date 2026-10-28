import { createFileRoute } from "@tanstack/react-router";
import Groups from "../modules/people/Groups";
export const Route = createFileRoute(
  "/workspace/$organizationId/people/groups",
)({ component: Page });
function Page() {
  const params = Route.useParams();
  return <Groups organizationId={params.organizationId} />;
}
