import { createFileRoute, notFound } from "@tanstack/react-router";
import CashPage from "../cash/CashPage";
import { uuid } from "../community/contracts";
import { cashViews, type CashView } from "../cash/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/cash",
)({
  beforeLoad: ({ params }) => {
    try {
      uuid(params.activityId);
      uuid(params.sessionId);
    } catch {
      throw notFound();
    }
  },
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q.slice(0, 80) : "",
    view: cashViews.includes(s.view as CashView)
      ? (s.view as CashView)
      : ("all" as CashView),
  }),
  component: Page,
});
function Page() {
  const params = Route.useParams(),
    filters = Route.useSearch(),
    navigate = Route.useNavigate();
  return (
    <CashPage
      {...params}
      filters={filters}
      onFiltersChange={(search) => void navigate({ search, replace: true })}
    />
  );
}
