import { createFileRoute, notFound } from "@tanstack/react-router";
import RegistrationPage from "../registration/RegistrationPage";
import { uuid } from "../community/contracts";
import {
  registrationViews,
  type RegistrationView,
} from "../registration/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/registrations",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.activityId);
      uuid(params.sessionId);
    } catch {
      throw notFound();
    }
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { q: string; view: RegistrationView } => ({
    q: typeof search.q === "string" ? search.q.slice(0, 80) : "",
    view: registrationViews.includes(search.view as RegistrationView)
      ? (search.view as RegistrationView)
      : "confirmed",
  }),
  component: Page,
});
function Page() {
  const params = Route.useParams(),
    filters = Route.useSearch(),
    navigate = Route.useNavigate();
  return (
    <RegistrationPage
      {...params}
      filters={filters}
      onFiltersChange={(search) => void navigate({ search, replace: true })}
    />
  );
}
