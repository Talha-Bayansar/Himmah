import { beforeEach, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import OrganizationPortal from "../src/organization/OrganizationPortal";
import type { WorkspaceSection } from "../src/organization/WorkspaceNavigation";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
const owner = {
  id: "launch-owner",
  name: "Test Organizer",
  email: "organizer@example.invalid",
  emailVerified: true,
};
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Community",
  slug: "test-community",
  role: "owner",
  timezone: "UTC",
  createdAt: "2026-10-18T00:00:00Z",
};
beforeEach(() => {
  void setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
function mountLaunch() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const launch = createRoute({
    getParentRoute: () => root,
    path: "/app",
    component: () => <OrganizationPortal initialMode="signin" launch />,
  });
  const start = createRoute({
    getParentRoute: () => root,
    path: "/start",
    validateSearch: (search: Record<string, unknown>) => ({
      mode: search.mode,
    }),
    component: () => <OrganizationPortal initialMode="signin" />,
  });
  const workspace = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/$section",
    component: () => {
      const { organizationId, section } = workspace.useParams();
      return (
        <OrganizationPortal
          workspaceId={organizationId}
          workspaceSection={section as WorkspaceSection}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([launch, start, workspace]),
    history: createMemoryHistory({ initialEntries: ["/app"] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <ConfirmationProvider>
          <RouterProvider router={router} />
        </ConfirmationProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return router;
}
for (const scenario of [
  {
    name: "signed-out accounts to sign-in",
    user: null,
    organizations: [org],
    nextCursor: null,
    destination: "/start",
    signin: true,
  },
  {
    name: "a single organization owner straight to members",
    user: owner,
    organizations: [org],
    nextCursor: null,
    destination: `/workspace/${org.id}/members`,
  },
  {
    name: "a single organization volunteer to settings",
    user: owner,
    organizations: [{ ...org, role: "volunteer" }],
    nextCursor: null,
    destination: `/workspace/${org.id}/settings`,
  },
  {
    name: "a single participant straight to personal progress",
    user: owner,
    organizations: [{ ...org, role: "participant" }],
    nextCursor: null,
    destination: `/workspace/${org.id}/me`,
  },
  {
    name: "multiple organizations to the chooser",
    user: owner,
    organizations: [
      org,
      { ...org, id: "22222222-2222-4222-8222-222222222222" },
    ],
    nextCursor: null,
    destination: "/start",
  },
  {
    name: "a partial organization page to the chooser without fetching every page",
    user: owner,
    organizations: [org],
    nextCursor: "next-page",
    destination: "/start",
  },
  {
    name: "accounts without an organization to setup",
    user: owner,
    organizations: [],
    nextCursor: null,
    destination: "/start",
  },
])
  it(`PWA launch sends ${scenario.name}`, async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        requests.push(path);
        if (path === "/api/account")
          return scenario.user
            ? Response.json({ user: scenario.user })
            : Response.json({}, { status: 401 });
        if (path === "/api/organizations")
          return Response.json({
            organizations: scenario.organizations,
            nextCursor: scenario.nextCursor,
          });
        if (path === `/api/organizations/${org.id}`)
          return Response.json({ organization: scenario.organizations[0] });
        return Response.json({ items: [], nextCursor: null });
      }),
    );
    const router = mountLaunch();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(scenario.destination),
    );
    if (scenario.signin)
      expect(router.state.location.search.mode).toBe("signin");
    expect(requests.some((path) => path.includes("cursor="))).toBe(false);
  });
