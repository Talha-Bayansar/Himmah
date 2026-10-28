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
import Directory from "../src/community/Directory";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Community",
  slug: "community",
  timezone: "UTC",
  role: "owner" as const,
  createdAt: "2026-10-28T10:00:00Z",
};
function mount(section: "staff" | "invitations") {
  const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
    root = createRootRoute({ component: () => <Outlet /> }),
    page = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => (
        <Directory organization={org} userId="owner" section={section} />
      ),
    }),
    router = createRouter({
      routeTree: root.addChildren([page]),
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
  setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("staff invitation retries preserve the request token and only reveal a share link after a successful save", async () => {
  let fail = true;
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        return fail
          ? Response.json({ code: "service" }, { status: 503 })
          : Response.json({ id: "fixture" });
      }
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  mount("invitations");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Invite staff" }));
  let dialog = await screen.findByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Email address"),
    "staff@example.test",
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByRole("alert");
  expect(screen.queryByText(/Send this link yourself/)).toBeNull();
  fail = false;
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await screen.findByText(/Send this link yourself/);
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(String(writes[0]!.token)).toHaveLength(43);
});
it("staff removal requires confirmation and preserves access on cancel", async () => {
  const writes: RequestInit[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        writes.push(init);
        return Response.json({ success: true });
      }
      return Response.json({
        items: [
          {
            id: "volunteer",
            name: "Volunteer",
            role: "volunteer",
            createdAt: org.createdAt,
          },
        ],
        nextCursor: null,
      });
    }),
  );
  mount("staff");
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for Volunteer" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Remove access" }),
  );
  let confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(writes).toHaveLength(0);
  await user.click(
    screen.getByRole("button", { name: "Actions for Volunteer" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Remove access" }),
  );
  confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(JSON.parse(String(writes[0]!.body))).toEqual({
    previous: "volunteer",
  });
});
it("a current authorization denial hides and clears cached staff rows", async () => {
  let denied = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      denied
        ? Response.json({ code: "forbidden" }, { status: 403 })
        : Response.json({
            items: [
              {
                id: "volunteer",
                name: "Private staff",
                role: "volunteer",
                createdAt: org.createdAt,
              },
            ],
            nextCursor: null,
          }),
    ),
  );
  const client = mount("staff");
  await screen.findByText("Private staff");
  denied = true;
  await client.invalidateQueries({
    queryKey: ["organization", "owner", org.id, "directory", "staff"],
  });
  await waitFor(() => expect(screen.queryByText("Private staff")).toBeNull());
  expect(screen.getByRole("alert")).toBeTruthy();
});
