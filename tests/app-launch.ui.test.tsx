import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
import OrganizationPortal from "../src/organization/OrganizationPortal";
import Contacts from "../src/modules/people/Contacts";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
const id = "11111111-1111-4111-8111-111111111111",
  contactId = "22222222-2222-4222-8222-222222222222";
const org = {
  id,
  name: "Community",
  slug: "community",
  timezone: "UTC",
  role: "owner",
  createdAt: "2026-10-28T10:00:00Z",
};
const contact = {
  id: contactId,
  displayName: "Ali",
  givenName: null,
  familyName: null,
  version: 1,
  archivedAt: null,
  createdAt: org.createdAt,
};
function backend(role = "owner") {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://himmah.test"),
      o = { ...org, role };
    if (url.pathname === "/api/account")
      return Response.json({
        user: {
          id: "staff",
          name: "Staff",
          email: "staff@example.test",
          emailVerified: true,
        },
      });
    if (url.pathname === "/api/organizations")
      return Response.json({ organizations: [o], nextCursor: null });
    if (url.pathname === "/api/organizations/" + id)
      return Response.json({ organization: o });
    if (url.pathname.endsWith("/dashboard"))
      return Response.json({ items: [], generatedAt: "2026-10-30T10:00:00Z" });
    if (url.pathname.endsWith("/insights"))
      return Response.json({
        summary: { visits: 8, unique: 5, outstandingMinor: 500 },
      });
    if (url.pathname.endsWith("/context"))
      return Response.json({ id, name: org.name });
    if (url.pathname.endsWith("/notifications/unread"))
      return Response.json({ count: 0 });
    if (url.pathname.endsWith("/contacts/" + contactId))
      return Response.json(contact);
    if (url.pathname.endsWith("/contacts"))
      return Response.json({ items: [contact], nextCursor: null });
    if (url.pathname.endsWith("/routing"))
      return Response.json({
        preferences: {
          routineDirectAllowed: true,
          emergencyDirectAllowed: false,
        },
        routine: { candidates: [], total: 0, missing: 0, alternatives: 0 },
        emergency: { candidates: [], total: 0, missing: 0, alternatives: 0 },
      });
    return Response.json({ items: [], nextCursor: null, total: 0 });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mount(path = "/hub") {
  const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
    root = createRootRoute({ component: () => <Outlet /> });
  const hub = createRoute({
    getParentRoute: () => root,
    path: "/hub",
    component: () => <OrganizationPortal launch />,
  });
  const contacts = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/people/contacts",
    component: () => <Contacts organizationId={id} />,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/people/contacts/$contactId",
    component: () => <Contacts organizationId={id} contactId={contactId} />,
  });
  const section = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/$section",
    component: () => (
      <OrganizationPortal
        workspaceId={id}
        workspaceSection={
          section.useParams().section as "manage" | "activities" | "dashboard"
        }
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([hub, contacts, detail, section]),
    history: createMemoryHistory({ initialEntries: [path] }),
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
  return { router, client };
}
beforeEach(() => {
  setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("launches owners into Home and preserves People navigation and a reloadable profile", async () => {
  const fetcher = backend();
  const { router } = mount();
  await screen.findByRole("heading", { name: "Home" });
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/workspace/${id}/dashboard`),
  );
  const navigation = screen.getByRole("navigation", {
    name: "Main navigation",
  });
  expect(
    within(navigation)
      .getByRole("link", { name: "Home" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(
    within(navigation).getByRole("link", { name: "Activities" }),
  ).toBeTruthy();
  expect(within(navigation).getByRole("link", { name: "Manage" })).toBeTruthy();
  expect(
    screen.queryByRole("link", { name: /Rewards|Futsal|Challenges|Points/ }),
  ).toBeNull();
  await userEvent.click(
    within(navigation).getByRole("link", { name: "People" }),
  );
  await screen.findByText("Ali");
  await userEvent.click(
    screen
      .getAllByRole("link")
      .find(
        (a) =>
          a.getAttribute("href") ===
          `/workspace/${id}/people/contacts/${contactId}`,
      )!,
  );
  await screen.findByRole("heading", { name: "Ali" });
  expect(router.state.location.pathname).toBe(
    `/workspace/${id}/people/contacts/${contactId}`,
  );
  expect(
    fetcher.mock.calls.some(([u]) =>
      /points|rewards|challenges|futsal|participants/.test(String(u)),
    ),
  ).toBe(false);
});
it("volunteer launch opens scoped Home and does not expose administrator People controls", async () => {
  backend("volunteer");
  const { router } = mount();
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/workspace/${id}/dashboard`),
  );
  expect(screen.queryByRole("link", { name: "People" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Manage" })).toBeNull();
});
it("Manage contains staff and organization controls without removed product links or a separate People entry", async () => {
  backend();
  mount(`/workspace/${id}/manage`);
  await screen.findByRole("heading", { name: "Manage" });
  const main = screen.getByRole("main");
  expect(
    within(main).queryByRole("link", {
      name: /Rewards|Futsal|Challenges|Engagement periods/,
    }),
  ).toBeNull();
  expect(within(main).getByRole("link", { name: /Staff/ })).toBeTruthy();
  expect(within(main).queryByRole("link", { name: "Contacts" })).toBeNull();
});
