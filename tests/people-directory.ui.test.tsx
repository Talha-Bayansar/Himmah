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
import Groups from "../src/modules/people/Groups";
import Contacts from "../src/modules/people/Contacts";
import RelationshipTypes from "../src/modules/people/RelationshipTypes";
const org = "11111111-1111-4111-8111-111111111111",
  groupId = "22222222-2222-4222-8222-222222222222",
  contactId = "33333333-3333-4333-8333-333333333333",
  otherId = "44444444-4444-4444-8444-444444444444",
  typeId = "55555555-5555-4555-8555-555555555555",
  versionId = "66666666-6666-4666-8666-666666666666",
  membershipId = "77777777-7777-4777-8777-777777777777";
const createdAt = "2026-10-28T10:00:00Z";
const group = {
  id: groupId,
  name: "Friday group",
  description: "Weekly gathering",
  version: 3,
  archivedAt: null,
  createdAt,
  memberCount: 1,
};
const ali = {
  id: contactId,
  displayName: "Ali",
  givenName: null,
  familyName: null,
  version: 2,
  archivedAt: null,
  createdAt,
  activeGroupCount: 1,
};
const bob = { ...ali, id: otherId, displayName: "Bob", version: 4 };
const father = {
  id: typeId,
  code: "father",
  symmetric: false,
  category: "family",
  version: 1,
  typeVersionId: versionId,
  forwardLabels: { en: "Father", nl: "Vader", tr: "Baba" },
  inverseLabels: { en: "Child", nl: "Kind", tr: "Çocuk" },
  archivedAt: null,
  createdAt,
};
const member = {
  id: membershipId,
  contactId,
  displayName: "Ali",
  contactVersion: 2,
  contactArchived: false,
  version: 1,
  validFrom: createdAt,
  validTo: null,
  endReason: null,
  createdAt,
};
function mount(path = "groups") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const list = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/people/groups",
    component: () => <Groups organizationId={org} />,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/people/groups/$groupId",
    component: () => <Groups organizationId={org} groupId={groupId} />,
  });
  const contacts = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/people/contacts",
    component: () => <Contacts organizationId={org} />,
  });
  const contact = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/people/contacts/$contactId",
    component: () => <Contacts organizationId={org} contactId={contactId} />,
  });
  const types = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/manage/relationship-types",
    component: () => <RelationshipTypes organizationId={org} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([list, detail, contacts, contact, types]),
    history: createMemoryHistory({
      initialEntries: [
        path === "types"
          ? `/workspace/${org}/manage/relationship-types`
          : `/workspace/${org}/people/${path}`,
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
      const custom = await handler?.(url, init);
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
      if (url.pathname.endsWith("/groups/" + groupId))
        return Response.json(group);
      if (url.pathname.endsWith("/contacts/" + contactId))
        return Response.json(ali);
      if (url.pathname.endsWith("/groups"))
        return Response.json({ items: [group], nextCursor: null });
      if (url.pathname.endsWith("/members"))
        return Response.json({ items: [member], nextCursor: null });
      if (url.pathname.endsWith("/member-options"))
        return Response.json({
          items: [{ ...ali, assigned: true }, bob],
          nextCursor: null,
        });
      if (url.pathname.endsWith("/relationship-types"))
        return Response.json({ items: [father], nextCursor: null });
      if (url.pathname.endsWith("/contacts"))
        return Response.json({ items: [ali, bob], nextCursor: null });
      if (url.pathname.endsWith("/group-options"))
        return Response.json({ items: [group], nextCursor: null });
      return Response.json({ items: [], nextCursor: null });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("opens a real group detail route, fetching independent metadata and member records", async () => {
  const fetcher = backend(),
    { router } = mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("link", { name: "View group" }));
  expect(
    await screen.findByRole("heading", { name: "Friday group", level: 1 }),
  ).toBeTruthy();
  expect(router.state.location.pathname).toBe(
    `/workspace/${org}/people/groups/${groupId}`,
  );
  expect(await screen.findByRole("link", { name: "Ali" })).toBeTruthy();
  expect(
    fetcher.mock.calls.some(([path]) =>
      String(path).endsWith("/groups/" + groupId),
    ),
  ).toBe(true);
});
it("creates a group with only a name and navigates to its saved detail without a discard prompt", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend((url, init) => {
    if (url.pathname.endsWith("/groups") && init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({ id: groupId });
    }
  });
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add group" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Group name"), "Friday group");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(submitted).toBeDefined());
  expect(submitted).toMatchObject({ name: "Friday group", description: null });
  expect(submitted?.requestKey).toMatch(/^[a-f0-9-]{36}$/);
  expect(
    await screen.findByRole("heading", { name: "Friday group", level: 1 }),
  ).toBeTruthy();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("keeps selections across picker pages, marks existing memberships, and submits snapshot versions", async () => {
  let submitted: Record<string, unknown> | undefined;
  const later = {
    ...bob,
    id: "88888888-8888-4888-8888-888888888888",
    displayName: "Cem",
    version: 6,
  };
  backend((url, init) => {
    if (url.pathname.endsWith("/member-options"))
      return Response.json(
        url.searchParams.has("cursor")
          ? { items: [later], nextCursor: null }
          : { items: [{ ...ali, assigned: true }, bob], nextCursor: "next" },
      );
    if (url.pathname.endsWith("/assignments") && init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({
        id: groupId,
        version: 4,
        outcomes: [
          { id: otherId, outcome: "saved" },
          { id: later.id, outcome: "saved" },
        ],
      });
    }
  });
  mount("groups/" + groupId);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add members" }));
  const dialog = await screen.findByRole("dialog");
  const existing = await within(dialog).findByRole("checkbox", {
    name: /Ali.*Already assigned/,
  });
  expect(existing.hasAttribute("disabled")).toBe(true);
  expect(existing.getAttribute("aria-checked")).toBe("true");
  await user.click(within(dialog).getByRole("checkbox", { name: "Bob" }));
  await user.click(within(dialog).getByRole("button", { name: "Load more" }));
  await user.click(
    await within(dialog).findByRole("checkbox", { name: "Cem" }),
  );
  expect(within(dialog).getByText(/Selected: 2/).textContent).toContain(
    "Selected: 2",
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(submitted).toBeDefined());
  expect(submitted).toMatchObject({
    version: 3,
    contacts: [
      { id: otherId, version: 4 },
      { id: later.id, version: 6 },
    ],
  });
});
it("ending a membership requires a reason and cancellation never submits a write", async () => {
  const fetcher = backend((url, init) =>
    url.pathname.endsWith("/members/" + membershipId) &&
    init?.method === "DELETE"
      ? Response.json({ id: groupId })
      : undefined,
  );
  mount("groups/" + groupId);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for Ali" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "End membership" }),
  );
  let dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(
    false,
  );
  await user.click(screen.getByRole("button", { name: "Actions for Ali" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "End membership" }),
  );
  dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Reason"), "Changed group");
  await user.click(
    within(dialog).getByRole("button", { name: "End membership" }),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(true),
  );
  const payload = JSON.parse(
    String(
      fetcher.mock.calls.find(([, init]) => init?.method === "DELETE")![1]
        ?.body,
    ),
  );
  expect(payload).toMatchObject({
    version: 3,
    membershipVersion: 1,
    reason: "Changed group",
  });
});
it("relationship creation previews both directions and sends no account/access fields", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend((url, init) => {
    if (url.pathname.endsWith("/relationships") && init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({ id: contactId });
    }
  });
  mount("contacts/" + contactId);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Add relationship" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    await within(dialog).findByRole("checkbox", { name: "Bob" }),
  );
  await user.click(
    await within(dialog).findByRole("checkbox", { name: "Father" }),
  );
  expect(await within(dialog).findByText("Bob is Father of Ali.")).toBeTruthy();
  expect(within(dialog).getByText("Ali is Child of Bob.")).toBeTruthy();
  expect(within(dialog).getByText(/do not grant access/)).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(submitted).toBeDefined());
  expect(submitted).toMatchObject({
    version: 2,
    otherContactId: otherId,
    otherVersion: 4,
    typeId,
    typeVersionId: versionId,
    direction: "other_is_role",
  });
  expect(Object.keys(submitted!).sort()).toEqual([
    "direction",
    "otherContactId",
    "otherVersion",
    "requestKey",
    "typeId",
    "typeVersionId",
    "version",
  ]);
});
it("a contact can join a group from its profile using the selected group version", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend((url, init) => {
    if (url.pathname.endsWith("/assignments") && init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({
        id: groupId,
        outcomes: [{ id: contactId, outcome: "saved" }],
      });
    }
  });
  mount("contacts/" + contactId);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add to group" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(
    await within(dialog).findByRole("checkbox", { name: "Friday group" }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(submitted).toBeDefined());
  expect(submitted).toMatchObject({
    version: 3,
    contacts: [{ id: contactId, version: 2 }],
  });
});
it("does not retain group metadata or cached roster on current access failure", async () => {
  let denied = false;
  backend((url) =>
    url.pathname.endsWith("/groups/" + groupId) && denied
      ? Response.json({ code: "not_found_or_forbidden" }, { status: 404 })
      : undefined,
  );
  const { client } = mount("groups/" + groupId);
  expect(
    await screen.findByRole("heading", { name: "Friday group", level: 1 }),
  ).toBeTruthy();
  denied = true;
  await client.invalidateQueries({
    queryKey: ["people", "owner", org, "group", groupId],
  });
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Ali" })).toBeNull();
});
it("type label editing keeps the opened version and submits all three locales", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend((url, init) => {
    if (
      url.pathname.endsWith("/relationship-types/" + typeId) &&
      init?.method === "PATCH"
    ) {
      submitted = JSON.parse(String(init.body));
      return Response.json({ id: typeId });
    }
  });
  const { client } = mount("types");
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for Father" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Edit labels" }),
  );
  const dialog = await screen.findByRole("dialog");
  const english = within(dialog).getByRole("group", { name: "English" });
  const forward = within(english).getByLabelText("Role (for example, parent)");
  await user.clear(forward);
  await user.type(forward, "Dad");
  client.setQueryData(["people", "owner", org, "types", "", false], {
    pages: [{ items: [{ ...father, version: 2 }], nextCursor: null }],
    pageParams: [null],
  });
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(submitted).toBeDefined());
  expect(submitted).toMatchObject({
    version: 1,
    forwardLabels: { en: "Dad", nl: "Vader", tr: "Baba" },
    inverseLabels: father.inverseLabels,
  });
  expect(submitted).not.toHaveProperty("symmetric");
});

it("a roster denial hides the whole People page and clears its cached private records", async () => {
  let denied = false;
  backend((url) =>
    url.pathname.endsWith("/members") && denied
      ? Response.json({ code: "not_found_or_forbidden" }, { status: 404 })
      : undefined,
  );
  const { client } = mount("groups/" + groupId);
  expect(await screen.findByRole("link", { name: "Ali" })).toBeTruthy();
  denied = true;
  await client.invalidateQueries({
    queryKey: ["people", "owner", org, "group-members", groupId],
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Friday group", level: 1 }),
    ).toBeNull(),
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    client.getQueryData(["people", "owner", org, "group", groupId]),
  ).toBeUndefined();
});

it("retains hidden selections across searches and lets staff remove them without finding the old page", async () => {
  backend((url) =>
    url.pathname.endsWith("/member-options")
      ? Response.json({
          items: url.searchParams.get("q") === "Nobody" ? [] : [bob],
          nextCursor: null,
        })
      : undefined,
  );
  mount("groups/" + groupId);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add members" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(
    await within(dialog).findByRole("checkbox", { name: "Bob" }),
  );
  await user.type(within(dialog).getByLabelText("Search contacts"), "Nobody");
  await within(dialog).findByText("No matching options found.");
  expect(within(dialog).getByText("Selected: 1")).toBeTruthy();
  await user.click(
    within(dialog).getByRole("button", { name: "Remove Bob from selection" }),
  );
  expect(within(dialog).queryByText("Selected: 1")).toBeNull();
});
