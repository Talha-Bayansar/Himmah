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
import Activities from "../src/activities/Activities";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Community",
  slug: "test",
  timezone: "Europe/Brussels",
  role: "owner" as const,
  createdAt: "2026-10-18T10:00:00Z",
};
const item = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Community evening",
  description: "A shared activity",
  location: "Main room",
  startsAt: "2026-11-06T17:00:00Z",
  endsAt: "2026-11-06T18:00:00Z",
  timezone: org.timezone,
  version: 1,
  cancelled: false,
  createdAt: org.createdAt,
};
function mount(role = "owner", activityId: string | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <Activities
        organization={{ ...org, role: role as "owner" | "volunteer" }}
        userId="owner-a"
        activityId={activityId}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
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
  return client;
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("activity pages append, retain loaded rows after pagination failure, and retry", async () => {
  let attempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://test");
      if (url.searchParams.has("cursor"))
        return ++attempts === 1
          ? Response.json({ code: "service" }, { status: 503 })
          : Response.json({
              items: [
                {
                  ...item,
                  id: "33333333-3333-4333-8333-333333333333",
                  name: "Next activity",
                },
              ],
              nextCursor: null,
            });
      return Response.json({ items: [item], nextCursor: "next" });
    }),
  );
  mount();
  const user = userEvent.setup();
  await screen.findByText(item.name);
  expect(
    screen.getByRole("link", { name: "View activity" }).getAttribute("href"),
  ).toBe(`/workspace/${org.id}/activities/${item.id}`);
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByText(item.name)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Next activity");
});
it("activity cancellation confirms first, cancel does not write, then save is version-bound", async () => {
  let writes = 0;
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        writes++;
        expect(JSON.parse(String(init.body))).toEqual({
          version: 1,
          cancelled: true,
        });
        return Response.json({
          item: { ...item, cancelled: true, version: 2 },
        });
      }
      return Response.json({ items: writes ? [] : [item], nextCursor: null });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for " + item.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Cancel activity" }),
  );
  let dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(writes).toBe(0);
  await user.click(
    screen.getByRole("button", { name: "Actions for " + item.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Cancel activity" }),
  );
  dialog = await screen.findByRole("alertdialog");
  await user.click(
    within(dialog).getByRole("button", {
      name: "Cancel activity",
    }),
  );
  await waitFor(() => expect(writes).toBe(1));
  await screen.findByText("No activities here yet.");
});
it("detail loads by ID without fetching the list; volunteers cannot edit", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
    Response.json({ item }),
  );
  vi.stubGlobal("fetch", fetcher);
  mount("volunteer", item.id);
  await screen.findByRole("heading", { name: item.name });
  expect(screen.getByText("A shared activity")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Actions for " + item.name }),
  ).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).toContain(
    "/activities/" + item.id,
  );
});
it("create errors preserve fields and retry uses the same creation key", async () => {
  const keys: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const value = JSON.parse(String(init.body));
        keys.push(value.key);
        return Response.json({ code: "activity_time" }, { status: 400 });
      }
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Create activity" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Activity name"),
    "Service day",
  );
  const starts = within(dialog).getByLabelText("Starts"),
    ends = within(dialog).getByLabelText("Ends");
  // Native datetime controls are set through their input event rather than keyboard emulation.
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.change(starts, { target: { value: "2026-11-06T18:00" } });
  fireEvent.change(ends, { target: { value: "2026-11-06T19:00" } });
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByRole("alert");
  expect(
    (within(dialog).getByLabelText("Activity name") as HTMLInputElement).value,
  ).toBe("Service day");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(keys.length).toBe(2));
  expect(keys[0]).toBe(keys[1]);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  const confirm = await screen.findByRole("alertdialog");
  await user.click(
    within(confirm).getByRole("button", {
      name: "Discard changes",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
