import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import Dashboard from "../src/dashboard/Dashboard";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Community",
  slug: "community",
  timezone: "Europe/Brussels",
  role: "owner" as const,
  createdAt: "2026-10-30T10:00:00Z",
};
const session = {
  id: "22222222-2222-4222-8222-222222222222",
  activityId: "33333333-3333-4333-8333-333333333333",
  name: "Community gathering",
  location: "Hall",
  startsAt: "2026-10-30T18:00:00Z",
  endsAt: "2026-10-30T19:00:00Z",
  timezone: org.timezone,
  canAttend: true,
  canCollect: true,
};
let empty = false,
  failure = false,
  denied = false;
function backend() {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (denied) return Response.json({ code: "forbidden" }, { status: 403 });
    if (failure && url.includes("/dashboard"))
      return Response.json({ code: "service" }, { status: 503 });
    return Response.json(
      url.includes("/dashboard")
        ? { items: empty ? [] : [session], generatedAt: "2026-10-30T10:00:00Z" }
        : {
            summary: {
              sessions: 3,
              visits: 18,
              unique: 12,
              outstandingMinor: 500,
              previous: {
                sessions: 2,
                visits: 14,
                unique: 10,
                outstandingMinor: 1000,
              },
              comparisonKind: "month",
              previousFrom: "2026-09-01",
              previousTo: "2026-09-30",
            },
          },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mount(role: "owner" | "volunteer" = "owner") {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/$section",
    component: () => (
      <Dashboard organization={{ ...org, role }} userId="staff" />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({
      initialEntries: [`/workspace/${org.id}/dashboard`],
    }),
  });
  render(
    <QueryClientProvider client={cache}>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { cache, router };
}
beforeEach(() => {
  setLocale("en", { reload: false });
  empty = false;
  failure = false;
  denied = false;
});
it("shows bounded upcoming work, compact monthly totals and real links without autofocus", async () => {
  backend();
  mount();
  const link = await screen.findByRole("link", { name: /Community gathering/ });
  expect(link.getAttribute("href")).toBe(
    `/workspace/${org.id}/activities/${session.activityId}/sessions/${session.id}`,
  );
  expect(
    screen.getByRole("link", { name: /All activities/ }).getAttribute("href"),
  ).toBe(`/workspace/${org.id}/schedule?q=`);
  expect(await screen.findByText("18")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: /View insights/ }).getAttribute("href"),
  ).toContain("/insights");
  expect(
    screen.getByRole("link", { name: /Manage contacts/ }).getAttribute("href"),
  ).toContain("/people/contacts");
  expect(document.activeElement).not.toBe(
    screen.getByRole("heading", { name: "Home" }),
  );
  expect(screen.getAllByRole("definition")).toHaveLength(4);
});
it("volunteers see scoped sessions without requesting organization insights or administrator shortcuts", async () => {
  const fetcher = backend();
  mount("volunteer");
  await screen.findByRole("link", { name: /Community gathering/ });
  expect(
    fetcher.mock.calls.some(([url]) => String(url).includes("/insights")),
  ).toBe(false);
  expect(screen.queryByRole("heading", { name: "This month" })).toBeNull();
  expect(screen.queryByRole("link", { name: /Manage contacts/ })).toBeNull();
});
it("keeps empty upcoming work distinct from a report with zero values", async () => {
  empty = true;
  backend();
  mount();
  await screen.findByText("No upcoming sessions to show.");
  expect(screen.getByRole("link", { name: /All activities/ })).toBeTruthy();
  expect(
    screen.getByRole("link", { name: /All activities/ }).getAttribute("href"),
  ).toBe(`/workspace/${org.id}/schedule?q=`);
  expect(await screen.findByText("18")).toBeTruthy();
});
it("recovers an upcoming failure without losing the independently available summary", async () => {
  failure = true;
  backend();
  mount();
  await screen.findByRole("alert");
  expect(
    screen.getByRole("link", { name: /All activities/ }).getAttribute("href"),
  ).toBe(`/workspace/${org.id}/schedule?q=`);
  expect(await screen.findByText("18")).toBeTruthy();
  failure = false;
  await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
  await screen.findByRole("link", { name: /Community gathering/ });
});
it("clears both dashboard and report caches on access loss and hides stale private data", async () => {
  backend();
  const { cache } = mount();
  await screen.findByText("18");
  await screen.findByRole("link", { name: /Community gathering/ });
  cache.setQueryData(["organization", "staff", org.id, "insights", "fixture"], {
    private: true,
  });
  cache.setQueryData(
    ["organization", "staff", org.id, "planned-sessions", "fixture"],
    { private: true },
  );
  denied = true;
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh dashboard" }),
  );
  await screen.findByRole("alert");
  await waitFor(() => expect(screen.queryByText("18")).toBeNull());
  expect(
    screen.queryByRole("link", { name: /Community gathering/ }),
  ).toBeNull();
  expect(
    cache.getQueriesData({
      queryKey: ["organization", "staff", org.id, "insights"],
    }),
  ).toHaveLength(0);
  expect(
    cache.getQueriesData({
      queryKey: ["organization", "staff", org.id, "planned-sessions"],
    }),
  ).toHaveLength(0);
  denied = false;
  await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
  expect(
    screen.getByRole("link", { name: /All activities/ }).getAttribute("href"),
  ).toBe(`/workspace/${org.id}/schedule?q=`);
  expect(await screen.findByText("18")).toBeTruthy();
});
