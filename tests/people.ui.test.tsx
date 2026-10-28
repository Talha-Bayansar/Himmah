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
import Contacts from "../src/modules/people/Contacts";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
const org = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const contact = {
  id,
  displayName: "Ali",
  givenName: null,
  familyName: null,
  version: 1,
  createdAt: "2026-10-28T10:00:00Z",
  archivedAt: null,
};
function mount(detail = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const list = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/people/contacts",
    component: () => <Contacts organizationId={org} />,
  });
  const item = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/people/contacts/$contactId",
    component: () => <Contacts organizationId={org} contactId={id} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([list, item]),
    history: createMemoryHistory({
      initialEntries: [
        `/workspace/${org}/people/contacts${detail ? "/" + id : ""}`,
      ],
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
function backend(
  handler?: (
    url: URL,
    init?: RequestInit,
  ) => Response | Promise<Response> | undefined,
) {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://himmah.test");
      const result = await handler?.(url, init);
      if (result) return result;
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
      if (url.pathname.endsWith("/" + id)) return Response.json(contact);
      if (
        url.pathname.endsWith("/methods") ||
        url.pathname.endsWith("/memberships") ||
        url.pathname.endsWith("/relationships") ||
        url.pathname.endsWith("/history")
      )
        return Response.json({ items: [], nextCursor: null });
      return Response.json({ items: [contact], nextCursor: null });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("opens a contact from the list and loads independent detail metadata", async () => {
  const fetcher = backend();
  const { router } = mount();
  await userEvent.click(await screen.findByRole("link", { name: "Ali" }));
  expect(
    await screen.findByRole("heading", { name: "Ali", level: 1 }),
  ).toBeTruthy();
  expect(router.state.location.pathname).toBe(
    `/workspace/${org}/people/contacts/${id}`,
  );
  expect(
    fetcher.mock.calls.some(([url]) => String(url).endsWith("/contacts/" + id)),
  ).toBe(true);
  expect(
    screen.queryByRole("heading", { name: "Contacts", level: 1 }),
  ).toBeNull();
});
it("creates a name-only contact, with a retry key and without enrollment/account fields", async () => {
  let payload: Record<string, unknown> | undefined;
  backend((url, init) => {
    if (url.pathname.endsWith("/contacts") && init?.method === "POST") {
      payload = JSON.parse(String(init.body));
      return Response.json({ id });
    }
  });
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add contact" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.getAttribute("data-slot")).toBe("drawer-content");
  expect(dialog.getAttribute("data-vaul-drawer-direction")).toBe("bottom");
  await user.type(within(dialog).getByLabelText("Display name"), "Ali");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(payload).toBeDefined());
  expect(payload).toMatchObject({
    displayName: "Ali",
    givenName: null,
    familyName: null,
  });
  expect(payload?.requestKey).toMatch(/^[a-f0-9-]{36}$/);
  expect(Object.keys(payload!).sort()).toEqual([
    "displayName",
    "familyName",
    "givenName",
    "requestKey",
  ]);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("archive cancellation sends no write; confirmation sends the expected version", async () => {
  const fetcher = backend((url, init) =>
    url.pathname.endsWith("/archive") ? Response.json({ id }) : undefined,
  );
  mount(true);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for Ali" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Archive contact" }),
  );
  let dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Actions for Ali" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Archive contact" }),
  );
  dialog = await screen.findByRole("alertdialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Archive contact" }),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1),
  );
  const write = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(String(write[1]?.body)).version).toBe(1);
});
it("does not render cached contact details after current access is denied", async () => {
  let denied = false;
  backend((url) =>
    url.pathname.endsWith("/" + id) && denied
      ? Response.json({ code: "not_found_or_forbidden" }, { status: 404 })
      : undefined,
  );
  const { client } = mount(true);
  expect(await screen.findByRole("heading", { name: "Ali" })).toBeTruthy();
  denied = true;
  await client.invalidateQueries({
    queryKey: ["people", "owner", org, "contact", id],
  });
  expect((await screen.findByRole("alert")).textContent).toContain(
    "do not have access",
  );
  expect(screen.queryByRole("heading", { name: "Ali" })).toBeNull();
});

it("keeps the edit version from opening the form when background metadata refreshes", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend((url, init) => {
    if (url.pathname.endsWith("/" + id) && init?.method === "PATCH") {
      submitted = JSON.parse(String(init.body));
      return Response.json({ code: "version_conflict" }, { status: 409 });
    }
  });
  const { client } = mount(true);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for Ali" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Edit contact" }),
  );
  const dialog = await screen.findByRole("dialog");
  const name = within(dialog).getByLabelText("Display name");
  await user.clear(name);
  await user.type(name, "My draft");
  client.setQueryData(["people", "owner", org, "contact", id], {
    ...contact,
    version: 2,
    displayName: "Other staff edit",
  });
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(submitted).toBeDefined());
  expect(submitted?.version).toBe(1);
  expect((await within(dialog).findByRole("alert")).textContent).toContain(
    "record changed",
  );
  expect((name as HTMLInputElement).value).toBe("My draft");
});
