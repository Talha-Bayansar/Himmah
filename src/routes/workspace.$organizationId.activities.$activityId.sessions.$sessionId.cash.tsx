import { createFileRoute, redirect } from "@tanstack/react-router";
import { cashViews, type CashView } from "../cash/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/cash",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q.slice(0, 80) : "",
    view: cashViews.includes(search.view as CashView)
      ? (search.view as CashView)
      : ("all" as CashView),
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance",
      params,
      search: { q: search.q, cashView: search.view },
      replace: true,
    });
  },
});
