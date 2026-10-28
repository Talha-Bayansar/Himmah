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
  useNavigate,
} from "@tanstack/react-router";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
import Contacts from "../src/modules/people/Contacts";
import {
  contactFilters,
  type ContactView,
} from "../src/modules/people/collections";
const org = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  createdAt = "2026-10-28T10:00:00Z";
const contact = {
  id,
  displayName: "Ali",
  givenName: null,
  familyName: null,
  version: 1,
  createdAt,
  archivedAt: null,
};
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`;
const groups = Array.from({ length: 68 }, (_, n) => ({
  id: uuid(n),
  groupId: uuid(n + 100),
  name: "Group " + String(n).padStart(2, "0"),
  groupVersion: 1,
  groupArchived: false,
  version: 1,
  validFrom: createdAt,
  validTo: null,
  createdAt,
}));
const ended = {
  ...groups[0],
  id: uuid(99),
  name: "Ended group",
  validTo: "2026-10-29T10:00:00Z",
};
const methods = Array.from({ length: 8 }, (_, n) => ({
  id: uuid(n),
  kind: "email",
  value: "method" + n + "@example.test",
  preferred: false,
  createdAt,
}));
const relations = Array.from({ length: 8 }, (_, n) => ({
  id: uuid(n),
  contactId: uuid(n + 200),
  displayName: "Relative " + n,
  contactArchived: false,
  subjectIsSource: false,
  forwardLabels: { en: "Parent", nl: "Ouder", tr: "Ebeveyn" },
  inverseLabels: { en: "Child", nl: "Kind", tr: "Çocuk" },
  symmetric: false,
  version: 1,
  validFrom: createdAt,
  validTo: null,
  endReason: null,
  createdAt,
}));
const history = Array.from({ length: 70 }, (_, n) => ({
  id: uuid(n),
  action: "update",
  version: n + 1,
  createdAt,
}));
function backend(handler?: (url: URL) => Response | undefined) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://himmah.test"),
      custom = handler?.(url);
    if (custom) return custom;
    if (url.pathname === "/api/organizations")
      return Response.json({
        organizations: [
          {
            id: org,
            name: "Community",
            slug: "community",
            timezone: "UTC",
            role: "owner",
            createdAt: "2026-10-28T10:00:00Z",
          },
        ],
        nextCursor: null,
      });
    if (url.pathname === "/api/organizations/" + org)
      return Response.json({
        organization: {
          id: org,
          name: "Community",
          slug: "community",
          timezone: "UTC",
          role: "owner",
          createdAt: "2026-10-28T10:00:00Z",
        },
      });
    if (url.pathname.endsWith("/notifications/unread"))
      return Response.json({ count: 0 });
    if (url.pathname === "/api/account")
      return Response.json({ user: { id: "owner", emailVerified: true } });
    if (url.pathname.endsWith("/routing"))
      return Response.json({
        preferences: {
          routineDirectAllowed: true,
          emergencyDirectAllowed: false,
        },
        routine: { candidates: [], total: 0, missing: 0, alternatives: 0 },
        emergency: { candidates: [], total: 0, missing: 0, alternatives: 0 },
      });
    if (url.pathname.endsWith("/communication"))
      return Response.json({ items: [], total: 0, nextCursor: null });
    if (url.pathname.endsWith("/context"))
      return Response.json({ id: org, name: "Community" });
    if (url.pathname.endsWith("/contacts/" + id)) return Response.json(contact);
    const kind = url.pathname.split("/").at(-1),
      q = url.searchParams.get("q") ?? "",
      limit = Number(url.searchParams.get("limit") ?? 25),
      offset = Number(url.searchParams.get("cursor") ?? 0);
    let items: Record<string, unknown>[] =
      kind === "memberships"
        ? url.searchParams.get("history") === "true"
          ? [...groups, ended]
          : groups
        : kind === "methods"
          ? methods
          : kind === "relationships"
            ? relations
            : kind === "history"
              ? history
              : [];
    items = items.filter((row) =>
      String(row.name ?? row.value ?? row.displayName ?? "")
        .toLowerCase()
        .includes(q.toLowerCase()),
    );
    return Response.json({
      items: items.slice(offset, offset + limit),
      total: items.length,
      nextCursor: offset + limit < items.length ? String(offset + limit) : null,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mount(path = "") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const profile = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/people/contacts/$contactId",
    component: () => <Contacts organizationId={org} contactId={id} />,
  });
  const full = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/people/contacts/$contactId/$view",
    validateSearch: contactFilters,
    component: CollectionPage,
  });
  function CollectionPage() {
    const params = full.useParams() as {
        organizationId: string;
        contactId: string;
        view: string;
      },
      filters = full.useSearch(),
      navigate = useNavigate();
    return (
      <Contacts
        organizationId={params.organizationId}
        contactId={params.contactId}
        view={params.view as ContactView}
        filters={filters}
        onFiltersChange={(next) =>
          void navigate({
            to: "/workspace/$organizationId/people/contacts/$contactId/$view",
            params,
            search: next,
            replace: true,
            resetScroll: false,
          })
        }
      />
    );
  }
  const router = createRouter({
    routeTree: root.addChildren([profile, full]),
    history: createMemoryHistory({
      initialEntries: [`/workspace/${org}/people/contacts/${id}` + path],
    }),
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
  return { client, router };
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("bounds every profile section to three server-requested rows and never mounts infinite-scroll observers", async () => {
  const observer = vi.fn(function () {
    return { observe: vi.fn(), disconnect: vi.fn() };
  });
  vi.stubGlobal("IntersectionObserver", observer);
  const fetcher = backend();
  mount();
  await screen.findByText("method2@example.test");
  await screen.findByRole("link", { name: "Group 02" });
  await screen.findByRole("link", { name: "Relative 2" });
  expect(screen.queryByText("method3@example.test")).toBeNull();
  expect(screen.queryByRole("link", { name: "Group 03" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Relative 3" })).toBeNull();
  const section = screen
    .getByRole("heading", { name: "Groups", level: 2 })
    .closest("section")!;
  expect(within(section).getByLabelText("Total: 68")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(
    screen.queryByRole("checkbox", { name: "Include ended records" }),
  ).toBeNull();
  expect(observer).not.toHaveBeenCalled();
  for (const name of [
    "View all contact details",
    "View all groups",
    "View all relationships",
    "View full history",
  ])
    expect(screen.getByRole("link", { name })).toBeTruthy();
  const collections = fetcher.mock.calls
    .map(([path]) => new URL(String(path), "https://himmah.test"))
    .filter((u) =>
      ["methods", "memberships", "relationships", "history"].includes(
        u.pathname.split("/").at(-1)!,
      ),
    );
  expect(collections).toHaveLength(4);
  expect(
    collections.every(
      (u) =>
        u.searchParams.get("limit") === "3" && !u.searchParams.has("cursor"),
    ),
  ).toBe(true);
});
it("opens a dedicated list with one parent link and loads further pages without replacing existing rows", async () => {
  let fail = true;
  backend((url) =>
    url.pathname.endsWith("/memberships") &&
    url.searchParams.get("cursor") === "25" &&
    fail
      ? ((fail = false), Response.json({ code: "service" }, { status: 503 }))
      : undefined,
  );
  const { router } = mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("link", { name: "View all groups" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Groups", level: 1 }),
  ).toBeTruthy();
  expect(router.state.location.pathname).toBe(
    `/workspace/${org}/people/contacts/${id}/groups`,
  );
  expect(await screen.findByRole("link", { name: "Group 24" })).toBeTruthy();
  expect(
    screen.queryByRole("link", { name: "View all relationships" }),
  ).toBeNull();
  expect(screen.getByRole("link", { name: "Ali" }).getAttribute("href")).toBe(
    `/workspace/${org}/people/contacts/${id}`,
  );
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("button", { name: "Try again" });
  expect(screen.getByRole("link", { name: "Group 00" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("link", { name: "Group 49" })).toBeTruthy();
  expect(screen.getByText("Total: 68")).toBeTruthy();
});
it("reloads a filtered history-inclusive list from the URL without loading sibling sections", async () => {
  const fetcher = backend();
  const { router } = mount("/groups?q=Ended&history=true");
  expect(await screen.findByRole("link", { name: "Ended group" })).toBeTruthy();
  expect(
    (screen.getByLabelText("Search groups") as HTMLInputElement).value,
  ).toBe("Ended");
  expect(
    screen
      .getByRole("checkbox", { name: "Include ended records" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(screen.getByText("Total: 1")).toBeTruthy();
  expect(
    fetcher.mock.calls.some(([path]) =>
      /\/(methods|relationships|history)\?/.test(String(path)),
    ),
  ).toBe(false);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Search groups"));
  await waitFor(() => expect(router.state.location.search.q).toBe(""));
  await user.click(
    screen.getByRole("checkbox", { name: "Include ended records" }),
  );
  await waitFor(() => expect(router.state.location.search.history).toBe(false));
});
it("loads methods, relationships and history directly using only the selected collection", async () => {
  backend();
  mount("/history");
  expect(
    await screen.findByRole("heading", { name: "History", level: 1 }),
  ).toBeTruthy();
  await screen.findByText("Total: 70");
  expect(
    screen.queryByRole("button", { name: "Add contact detail" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Add relationship" })).toBeNull();
  expect(screen.getAllByText(/Contact updated/)).toHaveLength(25);
});
it("keeps full-list cached pages separate from the bounded profile preview when returning", async () => {
  backend();
  const { router } = mount("/groups");
  await screen.findByRole("link", { name: "Group 24" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("link", { name: "Group 49" });
  await user.click(screen.getByRole("link", { name: "Ali" }));
  await screen.findByRole("heading", { name: "Ali", level: 1 });
  await screen.findByRole("link", { name: "Group 02" });
  expect(screen.queryByRole("link", { name: "Group 03" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(router.state.location.pathname).toBe(
    `/workspace/${org}/people/contacts/${id}`,
  );
});

it("keeps spaces while typing a bookmarked search and reports the filtered count", async () => {
  backend();
  const { router } = mount("/groups");
  const user = userEvent.setup();
  const input = await screen.findByLabelText("Search groups");
  await user.type(input, "Group 0");
  await waitFor(() => expect(router.state.location.search.q).toBe("Group 0"));
  await screen.findByText("Total: 10");
  expect((input as HTMLInputElement).value).toBe("Group 0");
  expect(screen.queryByRole("link", { name: "Group 10" })).toBeNull();
});
