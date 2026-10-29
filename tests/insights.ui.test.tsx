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
import Insights from "../src/insights/Insights";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
import {
  insightsFilters,
  type InsightsReport,
} from "../src/insights/contracts";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Community",
  slug: "community",
  role: "owner" as const,
  timezone: "Europe/Brussels",
  createdAt: "2020-01-01T00:00:00Z",
};
const activity = "22222222-2222-4222-8222-222222222222",
  group = "33333333-3333-4333-8333-333333333333";
const data: InsightsReport = {
  filters: {
    from: "2020-03-30",
    to: "2020-03-31",
    activity: "",
    group: "",
    bucket: "week",
  },
  timezone: org.timezone,
  generatedAt: "2026-10-29T10:00:00Z",
  summary: {
    sessions: 2,
    visits: 8,
    unique: 5,
    first: 2,
    returning: 3,
    registrations: 4,
    registeredPresent: 3,
    walkIns: 5,
    previousVisits: 6,
    previousFrom: "2020-03-28",
    previousTo: "2020-03-29",
    chargedMinor: 2000,
    paidMinor: 1500,
    outstandingMinor: 500,
    cashMinor: 1000,
    unallocatedMinor: 200,
  },
  trend: [{ date: "2020-03-30", visits: 8, unique: 5 }],
  items: [
    {
      id: activity,
      name: "Community gathering",
      createdAt: org.createdAt,
      sessions: 2,
      visits: 8,
      unique: 5,
      chargedMinor: 2000,
      paidMinor: 1500,
      outstandingMinor: 500,
    },
  ],
  nextCursor: null,
};
function mount(role: "owner" | "volunteer" = "owner") {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/insights",
    validateSearch: (s: Record<string, unknown>) => ({ ...s }),
    component: () => (
      <Insights organization={{ ...org, role }} userId="owner" />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({
      initialEntries: [
        `/workspace/${org.id}/insights?from=2020-03-30&to=2020-03-31`,
      ],
    }),
  });
  render(
    <QueryClientProvider client={cache}>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { router, cache };
}
beforeEach(() => {
  setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("shows distinct metrics, accessible trend and session versus receipt balances", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(data)),
  );
  mount();
  await screen.findByText("Community gathering");
  expect(
    [...document.querySelectorAll(".insights-metrics dd")].map(
      (e) => e.textContent,
    ),
  ).toEqual(["8", "5", "2", "3"]);
  expect(
    screen.getByRole("img", { name: "Participation over time" }),
  ).toBeTruthy();
  expect(screen.getByText(/Unallocated cash/)).toBeTruthy();
  expect(screen.getByText(/Current recorded charges/)).toBeTruthy();
  await userEvent.setup().click(screen.getByText("View period details"));
  expect(screen.getByText("8 attendances · 5 people")).toBeTruthy();
});
it("applies URL filters and rejects invalid ranges without another report request", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const u = new URL(String(input), "https://test");
      requests.push(u.search);
      return Response.json({
        ...data,
        filters: insightsFilters(
          Object.fromEntries(u.searchParams),
          org.timezone,
        ),
      });
    }),
  );
  const { router } = mount();
  await screen.findByText("Community gathering");
  const user = userEvent.setup();
  await user.click(screen.getByText("Filters"));
  await user.clear(screen.getByLabelText("From"));
  await user.type(screen.getByLabelText("From"), "2020-04-01");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await screen.findByRole("alert");
  expect(requests).toHaveLength(1);
  await user.clear(screen.getByLabelText("From"));
  await user.type(screen.getByLabelText("From"), "2020-03-01");
  await user.selectOptions(screen.getByLabelText("Show trends"), "month");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() =>
    expect(router.state.location.searchStr).toContain("2020-03-01"),
  );
  expect(router.state.location.searchStr).toContain("month");
});
it("filter sheets paginate options, support archived groups and never autofocus search", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const u = new URL(String(input), "https://test");
      if (u.pathname.endsWith("/options"))
        return Response.json(
          u.searchParams.has("cursor")
            ? {
                items: [
                  {
                    id: group,
                    name: "Historical group",
                    archived: true,
                    createdAt: org.createdAt,
                  },
                ],
                nextCursor: null,
              }
            : {
                items: [
                  {
                    id: activity,
                    name: "Other group",
                    archived: false,
                    createdAt: org.createdAt,
                  },
                ],
                nextCursor: "next",
              },
        );
      return Response.json({
        ...data,
        filters: insightsFilters(
          Object.fromEntries(u.searchParams),
          org.timezone,
        ),
        groupName: u.searchParams.get("group") ? "Historical group" : null,
      });
    }),
  );
  const { router } = mount();
  await screen.findByText("Community gathering");
  const user = userEvent.setup();
  await user.click(screen.getByText("Filters"));
  await user.click(screen.getByRole("button", { name: "Group" }));
  const sheet = await screen.findByRole("dialog");
  expect(document.activeElement).not.toBe(within(sheet).getByRole("searchbox"));
  await within(sheet).findByRole("button", { name: "Other group" });
  await user.click(within(sheet).getByRole("button", { name: "Load more" }));
  await user.click(
    await within(sheet).findByRole("button", { name: /Historical group/ }),
  );
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() => expect(router.state.location.searchStr).toContain(group));
  expect(screen.getByRole("button", { name: "Group" }).textContent).toContain(
    "Historical group",
  );
});
it("activity pages append and retain rows on a failed next page", async () => {
  let attempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("cursor="))
        return ++attempts === 1
          ? Response.json({ code: "service" }, { status: 503 })
          : Response.json({
              ...data,
              items: [
                { ...data.items[0]!, id: group, name: "Second activity" },
              ],
              nextCursor: null,
            });
      return Response.json({ ...data, nextCursor: "next" });
    }),
  );
  mount();
  const user = userEvent.setup();
  await screen.findByText("Community gathering");
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByText("Community gathering")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Second activity");
  expect(
    [...document.querySelectorAll(".insights-metrics dd")].map(
      (e) => e.textContent,
    ),
  ).toEqual(["8", "5", "2", "3"]);
});
it("permission loss clears private report data and requires an explicit retry", async () => {
  let revoked = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      revoked
        ? Response.json({ code: "forbidden" }, { status: 403 })
        : Response.json(data),
    ),
  );
  const { cache } = mount();
  await screen.findByText("Community gathering");
  revoked = true;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Refresh insights" }));
  await waitFor(() =>
    expect(screen.queryByText("Community gathering")).toBeNull(),
  );
  await screen.findByRole("alert");
  expect(
    cache
      .getQueriesData({
        queryKey: ["organization", "owner", org.id, "insights"],
      })
      .every(([, data]) => data === undefined),
  ).toBe(true);
});
it("volunteers cannot request organization-wide insights", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  mount("volunteer");
  await screen.findByRole("alert");
  expect(fetcher).not.toHaveBeenCalled();
});

it("failed refresh keeps the last report and announces the failure", async () => {
  let fail = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      fail
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json(data),
    ),
  );
  mount();
  await screen.findByText("Community gathering");
  fail = true;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Refresh insights" }));
  await screen.findByRole("alert");
  expect(screen.getByText("Community gathering")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});
