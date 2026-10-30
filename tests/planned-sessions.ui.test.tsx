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
import PlannedSessions from "../src/dashboard/PlannedSessions";
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
const base = {
  activityId: "33333333-3333-4333-8333-333333333333",
  location: "Hall",
  startsAt: "2099-01-05T18:00:00Z",
  endsAt: "2099-01-05T19:00:00Z",
  timezone: org.timezone,
  canAttend: true,
  canCollect: false,
};
const first = {
  ...base,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Sohbet",
  topic: "Patience",
};
const second = {
  ...base,
  id: "44444444-4444-4444-8444-444444444444",
  activityId: "55555555-5555-4555-8555-555555555555",
  name: "Workshop",
  startsAt: "2099-01-06T18:00:00Z",
  endsAt: "2099-01-06T19:00:00Z",
};
let denied = false,
  empty = false,
  failure = false,
  moreFailure = false;
function backend() {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://himmah.test");
    if (denied) return Response.json({ code: "forbidden" }, { status: 403 });
    if (failure) return Response.json({ code: "service" }, { status: 503 });
    if (url.searchParams.has("cursor")) {
      if (moreFailure) {
        moreFailure = false;
        return Response.json({ code: "service" }, { status: 503 });
      }
      return Response.json({ items: [first, second], nextCursor: null });
    }
    if (empty || url.searchParams.get("q"))
      return Response.json({ items: [], nextCursor: null });
    return Response.json({ items: [first], nextCursor: "next" });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mount(q = "", role: "owner" | "volunteer" = "owner") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const page = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/schedule",
    validateSearch: (s) => ({ q: typeof s.q === "string" ? s.q : "" }),
    component: () => (
      <PlannedSessions userId="staff" organization={{ ...org, role }} />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({
      initialEntries: [
        `/workspace/${org.id}/schedule?q=${encodeURIComponent(q)}`,
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
  denied = empty = failure = moreFailure = false;
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("renders the shared compact session row, correct detail and Home links without autofocus", async () => {
  backend();
  mount();
  const link = await screen.findByRole("link", { name: /Patience/ });
  expect(link.getAttribute("href")).toBe(
    `/workspace/${org.id}/activities/${first.activityId}/sessions/${first.id}`,
  );
  expect(within(link).getByText("Sohbet")).toBeTruthy();
  expect(within(link).getByText("Hall")).toBeTruthy();
  expect(link.querySelector("time")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe(
    `/workspace/${org.id}/dashboard`,
  );
  expect(document.activeElement).not.toBe(
    screen.getByRole("heading", { name: "Planned sessions" }),
  );
});
it("loads more after a failed page while retaining rows and showing a rescheduled record only once", async () => {
  moreFailure = true;
  backend();
  mount();
  await screen.findByRole("link", { name: /Patience/ });
  await userEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("link", { name: /Patience/ })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: /Workshop/ });
  expect(screen.getAllByRole("link", { name: /Patience/ })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});
it("keeps search in the URL, resets pagination and distinguishes no matches", async () => {
  const fetcher = backend();
  const { router } = mount();
  await screen.findByRole("link", { name: /Patience/ });
  await userEvent.type(screen.getByRole("searchbox"), "missing");
  await screen.findByText("Try a different search or filter.");
  await waitFor(() => expect(router.state.location.search.q).toBe("missing"));
  expect(screen.queryByRole("link", { name: /Patience/ })).toBeNull();
  expect(
    fetcher.mock.calls.some(([input]) => String(input).includes("q=missing")),
  ).toBe(true);
});
it("loads bookmarked searches and empty lists independently of dashboard data", async () => {
  const fetcher = backend();
  mount("workshop");
  await screen.findByText("Try a different search or filter.");
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
    "workshop",
  );
  expect(
    fetcher.mock.calls.every(
      ([input]) => !String(input).includes("/dashboard"),
    ),
  ).toBe(true);
});
it("clears all planned-list caches when access is lost and does not expose stale sessions", async () => {
  backend();
  const { client } = mount();
  await screen.findByRole("link", { name: /Patience/ });
  client.setQueryData(
    ["organization", "staff", org.id, "dashboard", "fixture"],
    { private: true },
  );
  denied = true;
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh sessions" }),
  );
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: /Patience/ })).toBeNull(),
  );
  await waitFor(() =>
    expect(
      client
        .getQueryCache()
        .findAll({
          queryKey: ["organization", "staff", org.id, "planned-sessions"],
        })
        .every((q) => q.state.data === undefined),
    ).toBe(true),
  );
  expect(
    client.getQueryData([
      "organization",
      "staff",
      org.id,
      "dashboard",
      "fixture",
    ]),
  ).toBeUndefined();
  denied = false;
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: /Patience/ });
});
it("supports scoped volunteers and retrying a service failure without administrator reports", async () => {
  failure = true;
  const fetcher = backend();
  mount("", "volunteer");
  await screen.findByRole("alert");
  failure = false;
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: /Patience/ });
  expect(
    fetcher.mock.calls.every(([input]) => String(input).includes("/sessions?")),
  ).toBe(true);
});
it("uses an honest empty state when there are no planned sessions", async () => {
  empty = true;
  backend();
  mount();
  await screen.findByText("No upcoming sessions to show.");
  expect(screen.queryByText("Try a different search or filter.")).toBeNull();
});
