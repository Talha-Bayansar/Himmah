import { beforeEach, it, expect, vi } from "vitest";
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
import FollowUp from "../src/insights/FollowUp";
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
const first = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Alex Morgan",
  createdAt: "2026-01-01T10:00:00Z",
  lastVisit: "2026-08-01T18:00:00Z",
  lastTopic: "Patience",
  lastActivity: "Sohbet",
};
const second = {
  ...first,
  id: "33333333-3333-4333-8333-333333333333",
  name: "Samira Demir",
  lastVisit: "2026-09-01T18:00:00Z",
};
let denied = false,
  failure = false,
  moreFailure = false,
  empty = false;
function backend() {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const u = new URL(String(input), "https://himmah.test");
    if (denied) return Response.json({ code: "forbidden" }, { status: 403 });
    if (failure) return Response.json({ code: "service" }, { status: 503 });
    if (u.searchParams.has("cursor") && moreFailure) {
      moreFailure = false;
      return Response.json({ code: "service" }, { status: 503 });
    }
    const never = u.searchParams.get("view") === "never",
      q = u.searchParams.get("q");
    return Response.json({
      items:
        empty || q
          ? []
          : never
            ? [
                {
                  ...second,
                  lastVisit: null,
                  lastTopic: null,
                  lastActivity: null,
                },
              ]
            : u.searchParams.has("cursor")
              ? [first, second]
              : [first],
      nextCursor:
        empty || q || never || u.searchParams.has("cursor") ? null : "next",
      summary: { recent: 2, never: 1 },
      since: "2026-10-03",
      timezone: org.timezone,
      generatedAt: "2026-11-01T00:30:00Z",
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mount(search = { days: 30, view: "recent", q: "" }, role = "owner") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const page = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/follow-up",
    validateSearch: (s) => ({
      days: Number(s.days ?? 30),
      view: String(s.view ?? "recent"),
      q: String(s.q ?? ""),
    }),
    component: () => (
      <FollowUp
        organization={{ ...org, role: role as "owner" }}
        userId="owner"
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({
      initialEntries: [
        `/workspace/${org.id}/follow-up?${new URLSearchParams({ days: String(search.days), view: search.view, q: search.q })}`,
      ],
    }),
  });
  render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { client, router };
}
beforeEach(() => {
  setLocale("en", { reload: false });
  denied = failure = moreFailure = empty = false;
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("shows last recorded visits with context and a contact link without autofocus or inferred absence", async () => {
  backend();
  mount();
  const link = await screen.findByRole("link", { name: /Alex Morgan/ });
  expect(link.getAttribute("href")).toBe(
    `/workspace/${org.id}/people/contacts/${first.id}`,
  );
  expect(within(link).getByText("Sohbet · Patience")).toBeTruthy();
  expect(screen.getByText(/No recorded visit since/)).toBeTruthy();
  expect(document.activeElement).not.toBe(
    screen.getByRole("heading", { name: "Participation follow-up" }),
  );
  expect(document.activeElement?.tagName).not.toBe("INPUT");
  await userEvent.click(screen.getByText("About this list"));
  expect(
    screen.getByText(/Missing records do not prove absence or disengagement/),
  ).toBeTruthy();
});
it("separates no recorded visits and shows the added date rather than an overdue score", async () => {
  backend();
  const { router } = mount();
  await screen.findByRole("link", { name: /Alex Morgan/ });
  await userEvent.click(
    screen.getByRole("tab", { name: /No recorded visits/ }),
  );
  const row = await screen.findByRole("link", { name: /Samira Demir/ });
  expect(within(row).getByText("No recorded attendance")).toBeTruthy();
  expect(row.textContent).toContain("Added");
  expect(row.textContent).not.toContain("Last recorded visit");
  expect(screen.queryByLabelText("Look back")).toBeNull();
  expect(router.state.location.search.view).toBe("never");
});
it("retains URL search/window on reload and binds each new filter to fresh pages", async () => {
  const fetcher = backend();
  const { router } = mount();
  await screen.findByRole("link", { name: /Alex Morgan/ });
  await userEvent.selectOptions(screen.getByLabelText("Look back"), "60");
  await waitFor(() => expect(router.state.location.search.days).toBe(60));
  await userEvent.type(screen.getByRole("searchbox"), "Robin");
  await screen.findByText("Try a different search or filter.");
  expect(router.state.location.search.q).toBe("Robin");
  expect(
    fetcher.mock.calls.some(([input]) => String(input).includes("days=60")),
  ).toBe(true);
});
it("keeps paged counts stable, retries a failed page and suppresses duplicated contacts", async () => {
  moreFailure = true;
  backend();
  mount();
  await screen.findByRole("link", { name: /Alex Morgan/ });
  await userEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("link", { name: /Alex Morgan/ })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: /Samira Demir/ });
  expect(screen.getAllByRole("link", { name: /Alex Morgan/ })).toHaveLength(1);
  expect(
    screen.getByRole("tab", { name: "No recent visits (2)" }),
  ).toBeTruthy();
});
it("hides and clears private data on access loss without deleting organization context", async () => {
  backend();
  const { client } = mount();
  await screen.findByRole("link", { name: /Alex Morgan/ });
  client.setQueryData(["organization", "owner", org.id], org);
  client.setQueryData(
    ["organization", "owner", org.id, "insights", "private"],
    { private: true },
  );
  denied = true;
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh participation" }),
  );
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: /Alex Morgan/ })).toBeNull(),
  );
  expect(client.getQueryData(["organization", "owner", org.id])).toEqual(org);
  expect(
    client.getQueryData([
      "organization",
      "owner",
      org.id,
      "insights",
      "private",
    ]),
  ).toBeUndefined();
  denied = false;
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: /Alex Morgan/ });
});
it("distinguishes empty results and a recoverable service error", async () => {
  failure = true;
  backend();
  mount();
  await screen.findByRole("alert");
  failure = false;
  empty = true;
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No contacts match this view.");
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});
it("volunteers cannot request or see organization follow-up", async () => {
  const fetcher = backend();
  mount(undefined, "volunteer");
  await screen.findByRole("alert");
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("searchbox")).toBeNull();
});
