import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/workspace/$organizationId")({
  beforeLoad: ({ params, location }) => {
    if (
      location.pathname.replace(/\/$/, "") ===
      `/workspace/${params.organizationId}`
    )
      throw redirect({
        to: "/workspace/$organizationId/$section",
        params: { ...params, section: "dashboard" },
        replace: true,
      });
  },
  component: Outlet,
});
