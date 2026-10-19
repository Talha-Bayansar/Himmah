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
import Periods from "../src/periods/Periods";
import { PeriodEditor } from "../src/periods/PeriodEditor";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test organization",
  slug: "test-org",
  role: "owner" as const,
  timezone: "Europe/Brussels",
  createdAt: "2020-01-01T00:00:00Z",
};
const period = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Spring programme",
  startDate: "2026-03-01",
  endDate: "2026-03-31",
  timezone: org.timezone,
  version: 1,
  closedAt: null as string | null,
  createdAt: "2026-01-01T00:00:00Z",
};
const summary = {
  members: 2,
  points: "14",
  present: 1,
  absent: 0,
  excused: 0,
  unmarked: 0,
};
function mount(component: React.ReactNode) {
  const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    }),
    root = createRootRoute({ component: () => <Outlet /> }),
    index = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => component,
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
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("preserves an uncertain create payload and retry key", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      bodies.push(JSON.parse(init.body));
      return bodies.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ item: period });
    }),
  );
  mount(
    <PeriodEditor
      path="/api/test/periods"
      timezone={org.timezone}
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Period name"),
    "Spring programme",
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByRole("alert");
  expect(
    within(dialog).getByLabelText("Period name").hasAttribute("disabled"),
  ).toBe(true);
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(bodies[1]).toEqual(bodies[0]);
});
it("confirms closing, cancels without saving, and renders the frozen report without edit actions", async () => {
  const user = userEvent.setup();
  let closed = false;
  const writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, init) => {
      const url = String(path);
      if (init?.method === "POST") {
        writes.push(JSON.parse(init.body));
        closed = true;
        return Response.json({
          item: { ...period, closedAt: "2026-04-01T10:00:00Z", version: 2 },
        });
      }
      if (url.includes("/summary"))
        return Response.json({ item: summary, group: null });
      if (url.includes("/members"))
        return Response.json({ items: [], nextCursor: null });
      return Response.json({
        item: {
          ...period,
          closedAt: closed ? "2026-04-01T10:00:00Z" : null,
          version: closed ? 2 : 1,
        },
      });
    }),
  );
  mount(<Periods organization={org} userId="owner" periodId={period.id} />);
  await screen.findByRole("heading", { name: period.name });
  await user.click(
    screen.getByRole("button", { name: "Actions for " + period.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Close period" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(writes).toHaveLength(0);
  await user.click(
    screen.getByRole("button", { name: "Actions for " + period.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Close period" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Close period",
    }),
  );
  await screen.findByText(/Frozen report/);
  expect(writes).toEqual([{ version: 1 }]);
  expect(
    screen.queryByRole("button", { name: "Actions for " + period.name }),
  ).toBeNull();
  expect(screen.getAllByRole("link", { name: "Periods" })).toHaveLength(1);
});
it("retains loaded periods when loading another page fails", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path) =>
      String(path).includes("cursor=next")
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ items: [period], nextCursor: "next" }),
    ),
  );
  mount(<Periods organization={org} userId="owner" />);
  await screen.findByText(period.name);
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByText(period.name)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});
