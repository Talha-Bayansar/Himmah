import { createFileRoute } from "@tanstack/react-router";
import RelationshipTypes from "../modules/people/RelationshipTypes";
export const Route = createFileRoute(
  "/workspace/$organizationId/manage/relationship-types",
)({ component: Page });
function Page() {
  const { organizationId } = Route.useParams();
  return <RelationshipTypes organizationId={organizationId} />;
}
