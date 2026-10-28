import { createFileRoute } from "@tanstack/react-router";
import Contacts from "../modules/people/Contacts";
export const Route = createFileRoute(
  "/workspace/$organizationId/people/contacts_/$contactId",
)({ component: Page });
function Page() {
  const params = Route.useParams();
  return (
    <Contacts
      organizationId={params.organizationId}
      contactId={params.contactId}
    />
  );
}
