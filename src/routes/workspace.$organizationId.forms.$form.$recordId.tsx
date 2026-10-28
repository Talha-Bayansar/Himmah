import { createFileRoute, notFound } from "@tanstack/react-router";
import { pageForms, type PageForm } from "../components/shared/form-navigation";
import { uuid } from "../community/contracts";
import WorkflowPage from "../organization/WorkflowPage";
export const Route = createFileRoute(
  "/workspace/$organizationId/forms/$form/$recordId",
)({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {},
  beforeLoad: ({ params }) => {
    if (!pageForms.includes(params.form as PageForm)) throw notFound();
    if (
      params.recordId === "new" &&
      ["activity", "access", "relationship-type"].includes(params.form)
    )
      return;
    try {
      uuid(params.recordId);
    } catch {
      throw notFound();
    }
  },
  component: Page,
});
function Page() {
  const { organizationId, form, recordId } = Route.useParams();
  return (
    <WorkflowPage
      organizationId={organizationId}
      form={form as PageForm}
      recordId={recordId}
    />
  );
}
