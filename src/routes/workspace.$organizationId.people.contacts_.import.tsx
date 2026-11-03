import { createFileRoute } from "@tanstack/react-router";
import ContactImport from "../modules/people/ContactImport";
export const Route = createFileRoute(
  "/workspace/$organizationId/people/contacts_/import",
)({ component: Page });
function Page() {
  const { organizationId } = Route.useParams();
  return <ContactImport organizationId={organizationId} />;
}
