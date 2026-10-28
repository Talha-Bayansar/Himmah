import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import Contacts from "../modules/people/Contacts";
import {
  contactFilters,
  contactViews,
  type ContactView,
} from "../modules/people/collections";
export const Route = createFileRoute(
  "/workspace/$organizationId/people/contacts_/$contactId_/$view",
)({
  validateSearch: contactFilters,
  beforeLoad: ({ params }) => {
    if (!contactViews.includes(params.view as ContactView)) throw notFound();
  },
  component: Page,
});
function Page() {
  const params = Route.useParams(),
    filters = Route.useSearch(),
    navigate = useNavigate({ from: Route.fullPath });
  return (
    <Contacts
      organizationId={params.organizationId}
      contactId={params.contactId}
      view={params.view as ContactView}
      filters={filters}
      onFiltersChange={(next) =>
        void navigate({ search: next, replace: true, resetScroll: false })
      }
    />
  );
}
