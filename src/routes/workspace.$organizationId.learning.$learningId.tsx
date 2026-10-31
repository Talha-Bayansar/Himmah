import { createFileRoute, Outlet } from "@tanstack/react-router";
export const Route = createFileRoute(
  "/workspace/$organizationId/learning/$learningId",
)({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q.slice(0, 80) : "",
    tab: ["questions", "results"].includes(String(s.tab))
      ? String(s.tab)
      : "participants",
    publication:
      typeof s.publication === "string" &&
      /^[0-9a-f-]{36}$/i.test(s.publication)
        ? s.publication
        : "",
    activity:
      typeof s.activity === "string" && /^[0-9a-f-]{36}$/i.test(s.activity)
        ? s.activity
        : "",
    session:
      typeof s.session === "string" && /^[0-9a-f-]{36}$/i.test(s.session)
        ? s.session
        : "",
  }),
  component: () => <Outlet />,
});
