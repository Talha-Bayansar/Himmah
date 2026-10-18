import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/start")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { mode?: "signin" | "signup" } =>
    search.mode === "signin" ? { mode: "signin" } : {},
  component: StartPage,
});
function StartPage() {
  const { mode } = Route.useSearch();
  return <OrganizationPortal initialMode={mode ?? "signup"} />;
}
