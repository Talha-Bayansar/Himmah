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
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
import { SeasonEditor } from "../src/futsal/SeasonEditor";
import { EntryEditor } from "../src/futsal/EntryEditor";
import { SeasonAction } from "../src/futsal/SeasonAction";
import { FutsalApp } from "../src/futsal/FutsalApp";
import { defaultSettings, type FutsalSeason } from "../src/futsal/contracts";
const org = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Test organization",
    slug: "test-org",
    timezone: "UTC",
    role: "owner" as const,
    createdAt: "2026-01-01T00:00:00Z",
  },
  id = "22222222-2222-4222-8222-222222222222";
const season: FutsalSeason = {
  id,
  name: "Test season",
  description: "",
  prizeCriteria: "",
  status: "draft",
  version: 4,
  settings: { ...defaultSettings("UTC"), playersPerTeam: 2 },
  seed: "33333333-3333-4333-8333-333333333333",
  createdAt: org.createdAt,
  preparedAt: null,
  cancelReason: null,
  snapshot: null,
  entryCount: 1,
};
function mount(component: React.ReactNode) {
  const root = createRootRoute({ component: () => <Outlet /> }),
    page = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => component,
    });
  const router = createRouter({
    routeTree: root.addChildren([
      page,
      createRoute({
        getParentRoute: () => root,
        path: "/futsal/$organizationId",
        component: () => <p>Season list destination</p>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/futsal/$organizationId/seasons/$seasonId",
        component: () => <p>Saved season destination</p>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/futsal/$organizationId/seasons/$seasonId/settings",
        component: () => <p>Edit destination</p>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/futsal/$organizationId/seasons/$seasonId/entries",
        component: () => <p>Entries destination</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
it("saves a configured Club Manager tournament to its canonical season route without quiz dependencies", async () => {
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      writes.push(JSON.parse(String(init?.body)));
      return Response.json({ item: { id } });
    }),
  );
  mount(<SeasonEditor organization={org} userId="owner" />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Season name"), "Community cup");
  await user.selectOptions(screen.getByLabelText("Play mode"), "club_manager");
  await user.selectOptions(screen.getByLabelText("Format"), "tournament");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Saved season destination");
  const settings = writes[0]!.settings as Record<string, unknown>;
  expect(settings.mode).toBe("club_manager");
  expect(settings.format).toBe("tournament");
  expect(settings.playersPerTeam).toBe(1);
  expect(settings.squadSize).toBe(7);
  expect(JSON.stringify(settings)).not.toMatch(/quiz|attendance/i);
  expect(writes).toHaveLength(1);
});
it("protects unsaved form changes and discards with one confirmation rather than two", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  mount(<SeasonEditor organization={org} userId="owner" />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Season name"), "Unfinished");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  let dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.getByLabelText("Season name")).toHaveProperty(
    "value",
    "Unfinished",
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  dialog = await screen.findByRole("alertdialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Discard changes" }),
  );
  await screen.findByText("Season list destination");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it("freezes uncertain season edits and retries the exact same payload and receipt", async () => {
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      writes.push(JSON.parse(String(init?.body)));
      return writes.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ item: { id } });
    }),
  );
  mount(<SeasonEditor organization={org} userId="owner" />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Season name"), "Retry safely");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  const retry = await screen.findByRole("button", { name: "Try again" });
  expect(screen.getByLabelText("Season name")).toHaveProperty("disabled", true);
  await user.click(retry);
  await screen.findByText("Saved season destination");
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
});
it("retains team selection across search and visibly disables participants already assigned elsewhere", async () => {
  const one = "44444444-4444-4444-8444-444444444444",
    taken = "55555555-5555-4555-8555-555555555555",
    two = "66666666-6666-4666-8666-666666666666";
  let body: Record<string, unknown> | undefined;
  const close = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        body = JSON.parse(String(init.body));
        return Response.json({ item: { id } });
      }
      return Response.json({
        items: String(input).includes("q=Extra")
          ? [
              {
                id: two,
                name: "Extra member",
                createdAt: org.createdAt,
                assignedTo: null,
              },
            ]
          : [
              {
                id: one,
                name: "Member one",
                createdAt: org.createdAt,
                assignedTo: null,
              },
              {
                id: taken,
                name: "Already member",
                createdAt: org.createdAt,
                assignedTo: "other-entry",
              },
            ],
        nextCursor: null,
      });
    }),
  );
  mount(
    <EntryEditor
      organizationId={org.id}
      userId="owner"
      season={season}
      onClose={close}
    />,
  );
  const user = userEvent.setup();
  await screen.findByText("Already member");
  const assigned = screen.getByRole("checkbox", { name: /Already member/ });
  expect(assigned).toHaveProperty("disabled", true);
  expect(assigned.getAttribute("data-state")).toBe("checked");
  await user.type(screen.getByLabelText("Club or team name"), "New team");
  await user.click(screen.getByRole("checkbox", { name: "Member one" }));
  await user.type(screen.getByRole("searchbox"), "Extra");
  await user.click(
    await screen.findByRole("checkbox", { name: "Extra member" }),
  );
  expect(screen.getByText("2 selected")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect((body!.members as string[]).sort()).toEqual([one, two].sort());
  expect(body!.version).toBe(4);
});
it("keeps loaded entry cards after a next-page error and hides them after authorization loss", async () => {
  let nextFails = true,
    denied = false;
  const a = {
    id: "44444444-4444-4444-8444-444444444444",
    name: "First team",
    createdAt: org.createdAt,
    members: [{ id: "p", name: "Private nickname", archived: false }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (denied) return Response.json({ code: "forbidden" }, { status: 403 });
      if (path.endsWith("/" + id)) return Response.json({ item: season });
      if (path.includes("cursor=")) {
        if (nextFails) {
          nextFails = false;
          return Response.json({ code: "service" }, { status: 503 });
        }
        return Response.json({
          items: [
            {
              ...a,
              id: "55555555-5555-4555-8555-555555555555",
              name: "Second team",
            },
          ],
          nextCursor: null,
        });
      }
      return Response.json({ items: [a], nextCursor: "next" });
    }),
  );
  const client = mount(
    <FutsalApp
      organization={org}
      userId="owner"
      location={{ page: "entries", seasonId: id }}
    />,
  );
  const user = userEvent.setup();
  await screen.findByText("First team");
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await user.click(await screen.findByRole("button", { name: "Try again" }));
  await screen.findByText("Second team");
  expect(screen.getByText("First team")).toBeTruthy();
  denied = true;
  await client.invalidateQueries({ queryKey: ["futsal", "owner", org.id] });
  await waitFor(() =>
    expect(screen.queryByText("Private nickname")).toBeNull(),
  );
});
it("does not lock a season until confirmation and preserves the reviewed version", async () => {
  const close = vi.fn(),
    writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      writes.push(JSON.parse(String(init?.body)));
      return Response.json({ item: { id } });
    }),
  );
  mount(
    <SeasonAction
      organizationId={org.id}
      userId="owner"
      season={season}
      action="prepare"
      onClose={close}
    />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Lock setup" }));
  let dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(writes).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Lock setup" }));
  dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Lock setup" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(writes).toHaveLength(1);
  expect(writes[0]!.version).toBe(4);
});
it("rejects an impossible draft calendar before making a request and reveals advanced settings", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  mount(<SeasonEditor organization={org} userId="owner" />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Season name"), "Too short");
  const start = (screen.getByLabelText("First match") as HTMLInputElement)
    .value;
  const deadline = screen.getByLabelText("Season deadline");
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.change(deadline, {
    target: { value: start.slice(0, 11) + "23:59" },
  });
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/The rounds must fit before the deadline/);
  expect(screen.getByLabelText("Equal starting rating")).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
