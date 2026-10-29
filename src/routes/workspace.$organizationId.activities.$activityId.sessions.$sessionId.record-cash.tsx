import { createFileRoute, notFound } from "@tanstack/react-router";
import CashPage from "../cash/CashPage";
import { uuid } from "../community/contracts";
export const Route = createFileRoute(
  "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/record-cash",
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
    s: Record<string, unknown>,
  ): { chargeId: string; personId?: string; returnTo: string | undefined } => {
    let chargeId = "";
    if (typeof s.chargeId === "string")
      try {
        chargeId = uuid(s.chargeId);
      } catch {}
    return {
      chargeId,
      personId:
        typeof s.personId === "string" && /^[0-9a-f-]{36}$/i.test(s.personId)
          ? s.personId
          : "",
      returnTo: typeof s.returnTo === "string" ? s.returnTo : undefined,
    };
  },
  component: Page,
});
function Page() {
  return (
    <CashPage
      {...Route.useParams()}
      {...Route.useSearch()}
      record
      filters={{ q: "", view: "all" }}
      onFiltersChange={() => {}}
    />
  );
}
