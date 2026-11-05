import { createFileRoute } from "@tanstack/react-router";
import ContactEditorPage from "../modules/people/ContactEditorPage";
export const Route = createFileRoute(
  "/workspace/$organizationId/people/contacts_/$contactId_/edit",
)({ component: Page });
function Page() {
  return (
    <ContactEditorPage
      org={Route.useParams().organizationId}
      id={Route.useParams().contactId}
    />
  );
}
