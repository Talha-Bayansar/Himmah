import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, within, waitFor, act } from "@testing-library/react";
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
import { InfiniteFooter } from "../src/components/shared/infinite-list";
import { setLocale } from "../src/paraglide/runtime.js";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Community",
  slug: "test-community",
  timezone: "UTC",
  role: "owner" as const,
  createdAt: "2026-10-18T10:00:00Z",
};
const first = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Nickname One",
  archived: false,
  version: 1,
  createdAt: "2026-10-18T10:00:00Z",
};
function mount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <Directory organization={org} userId="owner-a" />,
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
it("appends cursor pages and preserves loaded rows when the next page fails", async () => {
  let nextAttempts = 0;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://himmah.example");
    if (url.searchParams.has("cursor")) {
      nextAttempts++;
      return nextAttempts === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({
            items: [
              {
                ...first,
                id: "33333333-3333-4333-8333-333333333333",
                name: "Nickname Two",
              },
            ],
            nextCursor: null,
          });
    }
    return Response.json({ items: [first], nextCursor: "next-page" });
  });
  vi.stubGlobal("fetch", fetcher);
  mount();
  const user = userEvent.setup();
  await screen.findByText("Nickname One");
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText(
    "The next records could not be loaded. Your current list is still available.",
  );
  expect(screen.getByText("Nickname One")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Nickname Two");
  expect(screen.getByText("Nickname One")).toBeTruthy();
  expect(screen.getByText("You’ve reached the end of this list.")).toBeTruthy();
  expect(nextAttempts).toBe(2);
  expect(String(fetcher.mock.calls[1]?.[0])).toContain("cursor=next-page");
});
it("archive requires confirmation and cancellation preserves the record", async () => {
  let archived = false;
  const changes = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        changes();
        archived = true;
        return Response.json({
          item: { ...first, archived: true, version: 2 },
        });
      }
      return Response.json({
        items: archived ? [] : [first],
        nextCursor: null,
      });
    }),
  );
  mount();
  const user = userEvent.setup();
  await screen.findByText("Nickname One");
  await user.click(screen.getByRole("button", { name: "Archive" }));
  let dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(changes).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Archive" }));
  dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Archive" }));
  await waitFor(() => expect(changes).toHaveBeenCalledTimes(1));
  await screen.findByText("No records here yet.");
});
it("member form preserves dirty fields when discarding is cancelled and sends consent with a retry key", async () => {
  let created = false;
  const payloads: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const value = JSON.parse(String(init.body));
        payloads.push(value);
        created = true;
        return Response.json(
          { item: { ...first, name: value.name } },
          { status: 201 },
        );
      }
      return Response.json({
        items: created ? [{ ...first, name: "New Nickname" }] : [],
        nextCursor: null,
      });
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add member" }));
  let dialog = await screen.findByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Display name"),
    "New Nickname",
  );
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  const confirmation = await screen.findByRole("alertdialog");
  await user.click(
    within(confirmation).getByRole("button", { name: "Cancel" }),
  );
  dialog = screen.getByRole("dialog");
  expect(
    (within(dialog).getByLabelText("Display name") as HTMLInputElement).value,
  ).toBe("New Nickname");
  await user.click(within(dialog).getByRole("checkbox"));
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await screen.findByText("New Nickname");
  expect(payloads[0]).toMatchObject({ name: "New Nickname", consent: true });
  expect(payloads[0]?.key).toMatch(/^[a-f0-9-]{36}$/);
});
it("scroll sentinel avoids duplicate requests while a page is loading", async () => {
  let observed: IntersectionObserverCallback | undefined;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observed = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  let finish: (value: unknown) => void = () => {};
  const fetchNextPage = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <InfiniteFooter
      hasNextPage
      isFetchingNextPage={false}
      isFetchNextPageError={false}
      fetchNextPage={fetchNextPage}
    />,
  );
  act(() => {
    observed?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    observed?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({});
  });
});

it("marks existing memberships as disabled and only spins the group being added across cursor pages", async () => {
  const group = (id: string, name: string, assigned: boolean) => ({
    ...first,
    id,
    name,
    assigned,
  });
  const assigned = group(
    "33333333-3333-4333-8333-333333333333",
    "Study group",
    true,
  );
  const available = group(
    "44444444-4444-4444-8444-444444444444",
    "Sports group",
    false,
  );
  const other = group(
    "55555555-5555-4555-8555-555555555555",
    "Learning group",
    false,
  );
  const writes = vi.fn();
  let finish: (value: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://himmah.example");
      if (init?.method === "PUT") {
        writes(url.pathname);
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      if (url.pathname.endsWith("/group-options"))
        return Response.json(
          url.searchParams.has("cursor")
            ? { items: [available, other], nextCursor: null }
            : { items: [assigned], nextCursor: "second-page" },
        );
      return Response.json({ items: [first], nextCursor: null });
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add to group" }));
  const dialog = await screen.findByRole("dialog");
  const existing = await within(dialog).findByRole("button", {
    name: "Study group Already in this group",
  });
  expect((existing as HTMLButtonElement).disabled).toBe(true);
  expect(existing.querySelector("svg")).toBeTruthy();
  await user.click(existing);
  expect(writes).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Load more" }));
  const selected = await within(dialog).findByRole("button", {
    name: "Sports group",
  });
  await user.click(selected);
  await waitFor(() => expect(writes).toHaveBeenCalledTimes(1));
  expect(selected.getAttribute("aria-busy")).toBe("true");
  expect(existing.getAttribute("aria-busy")).toBe("false");
  expect(
    within(dialog)
      .getByRole("button", { name: "Learning group" })
      .getAttribute("aria-busy"),
  ).toBe("false");
  expect(
    within(dialog).getAllByRole("status", { name: "Working" }),
  ).toHaveLength(1);
  finish(Response.json({ success: true }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(writes).toHaveBeenCalledWith(
    `/api/organizations/${org.id}/people/${first.id}/groups/${available.id}`,
  );
});
