import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
import { FollowControl } from "../src/notifications/FollowControl";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
const org = "11111111-1111-4111-8111-111111111111",
  activity = "22222222-2222-4222-8222-222222222222",
  session = "33333333-3333-4333-8333-333333333333";
const initial = {
  following: true,
  reminderMinutes: 60,
  version: 0,
  source: "activity",
  canFollow: true,
};
function mount() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const page = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <FollowControl
        user="staff"
        org={org}
        activity={activity}
        session={session}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <LocaleProvider>
        <ConfirmationProvider>
          <RouterProvider router={router} />
        </ConfirmationProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  setLocale("en", { reload: false });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
it("shows inherited settings without autofocus and saves a personal session mute", async () => {
  const writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") writes.push(JSON.parse(String(init.body)));
      return Response.json(initial);
    }),
  );
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole("button", { name: "Following" }));
  expect(
    await screen.findByText(/You currently follow the activity/i),
  ).toBeTruthy();
  const checkbox = screen.getByRole("checkbox");
  expect(document.activeElement).not.toBe(checkbox);
  await user.click(checkbox);
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    following: false,
    reminderMinutes: 60,
    version: 0,
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("locks an uncertain outcome and retries precisely the same command", async () => {
  const writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        if (writes.length === 1) throw new TypeError("offline");
      }
      return Response.json(initial);
    }),
  );
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole("button", { name: "Following" }));
  await user.selectOptions(screen.getByRole("combobox"), "0");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("button", { name: "Try again" });
  expect(screen.getByRole("combobox").matches(":disabled")).toBe(true);
  expect(screen.getByRole("checkbox").closest("fieldset")?.disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]).toMatchObject({ reminderMinutes: 0 });
});
it("preserves choices through a version conflict and requires an explicit refresh", async () => {
  const writes: Record<string, unknown>[] = [];
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        if (writes.length === 1)
          return Response.json({ code: "version_conflict" }, { status: 409 });
        return Response.json(initial);
      }
      return Response.json({ ...initial, version: reads++ === 0 ? 0 : 4 });
    }),
  );
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole("button", { name: "Following" }));
  await user.selectOptions(screen.getByRole("combobox"), "0");
  await user.click(screen.getByRole("button", { name: "Save" }));
  const refresh = await screen.findByRole("button", {
    name: /Load latest settings/i,
  });
  expect(
    screen.getByRole("button", { name: "Save" }).matches(":disabled"),
  ).toBe(true);
  await user.click(refresh);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save" }).matches(":disabled"),
    ).toBe(false),
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("0");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toMatchObject({ version: 4, reminderMinutes: 0 });
  expect(writes[1]!.key).not.toBe(writes[0]!.key);
});
