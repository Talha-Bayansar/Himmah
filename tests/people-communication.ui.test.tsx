import { it, expect, vi, beforeEach } from "vitest";
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
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
import { Communication } from "../src/modules/people/Communication";
import { PeopleAccessFailure } from "../src/modules/people/shared";
const org = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const contact = {
  id,
  displayName: "Subject",
  givenName: null,
  familyName: null,
  version: 7,
  archivedAt: null,
  createdAt: "2026-10-28T10:00:00Z",
};
const assignment = {
  id: "33333333-3333-4333-8333-333333333333",
  responsibleContactId: "44444444-4444-4444-8444-444444444444",
  displayName: "Sam",
  contactArchived: false,
  purpose: "routine",
  priority: 1,
  channel: "phone",
  version: 2,
  validTo: null,
  endReason: null,
  createdAt: contact.createdAt,
  phone: "+32412345678",
  email: null,
};
const routing = {
  preferences: { routineDirectAllowed: true, emergencyDirectAllowed: false },
  routine: {
    candidates: [
      {
        contactId: assignment.responsibleContactId,
        displayName: "Sam",
        phone: assignment.phone,
        email: null,
        priority: 1,
        direct: false,
      },
    ],
    total: 1,
    missing: 2,
    alternatives: 4,
  },
  emergency: { candidates: [], total: 0, missing: 0, alternatives: 0 },
};
function backend(
  handler?: (url: URL, init?: RequestInit) => Response | undefined,
) {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input), "https://himmah.test");
      const custom = handler?.(u, init);
      if (custom) return custom;
      if (init?.method && init.method !== "GET") return Response.json({ id });
      if (u.pathname.endsWith("/routing")) return Response.json(routing);
      if (u.pathname.endsWith("/contacts"))
        return Response.json({
          items: [
            {
              ...contact,
              id: assignment.responsibleContactId,
              displayName: "Sam",
              version: 3,
            },
          ],
          nextCursor: null,
        });
      return Response.json({ items: [assignment], total: 9, nextCursor: null });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mount({ full = false, archived = false, denied = vi.fn() } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <PeopleAccessFailure.Provider value={denied}>
        <Communication
          org={org}
          user="owner"
          contact={{
            ...contact,
            archivedAt: archived ? "2026-10-28T11:00:00Z" : null,
          }}
          full={full}
          filters={{ q: "", history: false }}
          onFiltersChange={vi.fn()}
        />
      </PeopleAccessFailure.Provider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
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
  return { client, router, denied };
}
beforeEach(() => {
  setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("shows bounded contact recommendations, explicit missing-channel warnings and emergency empty state", async () => {
  const fetcher = backend();
  mount();
  await screen.findByText("Candidates without a usable allowed channel: 2");
  expect(screen.getByText(/Equally ranked options: 4/)).toBeTruthy();
  expect(
    screen
      .getAllByRole("link", { name: "+32412345678" })[0]!
      .getAttribute("href"),
  ).toBe("tel:+32412345678");
  expect(
    screen
      .getByRole("link", { name: "View all contact responsibilities" })
      .getAttribute("href"),
  ).toBe(
    `/workspace/${org}/people/contacts/${id}/communication?q=&history=false`,
  );
  expect(fetcher.mock.calls.some(([u]) => String(u).includes("limit=3"))).toBe(
    true,
  );
  expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Emergency" }));
  expect(
    screen.getByText(
      "No usable contact method. Add details or designate another contact person.",
    ),
  ).toBeTruthy();
});
it("saves explicit policy preferences independently of family links", async () => {
  const fetcher = backend();
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Direct contact preferences" }),
  );
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(
    within(dialog).getByRole("checkbox", {
      name: "Use own details first for routine contact",
    }),
  );
  await userEvent.click(
    within(dialog).getByRole("checkbox", {
      name: "Allow own details as an emergency fallback",
    }),
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const call = fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")!;
  expect(String(call[0])).toContain("/communication-preferences");
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({
    version: 7,
    routineDirectAllowed: false,
    emergencyDirectAllowed: true,
  });
});
it("selects an unrelated contact and retains the draft and request key on an uncertain retry", async () => {
  let failed = true;
  const fetcher = backend((u, init) =>
    u.pathname.endsWith("/communication") && init?.method === "POST" && failed
      ? Response.json({ code: "service" }, { status: 503 })
      : undefined,
  );
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Add contact person" }),
  );
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(
    await within(dialog).findByRole("checkbox", { name: "Sam" }),
  );
  await userEvent.selectOptions(
    within(dialog).getByLabelText("Purpose"),
    "emergency",
  );
  await userEvent.selectOptions(
    within(dialog).getByLabelText("Allowed channel"),
    "email",
  );
  await userEvent.clear(
    within(dialog).getByLabelText("Priority (1 first, 99 last)"),
  );
  await userEvent.type(
    within(dialog).getByLabelText("Priority (1 first, 99 last)"),
    "2",
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByRole("alert");
  expect(
    (within(dialog).getByLabelText("Allowed channel") as HTMLSelectElement)
      .value,
  ).toBe("email");
  failed = false;
  await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const writes = fetcher.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]).toMatchObject({
    version: 7,
    responsibleVersion: 3,
    purpose: "emergency",
    channel: "email",
    priority: 2,
  });
});
it("ending requires a reason and archived profiles expose history without management actions", async () => {
  const fetcher = backend();
  mount({ full: true });
  await userEvent.click(
    await screen.findByRole("button", { name: /more|actions/i }),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "End responsibility" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(fetcher.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(
    false,
  );
  await userEvent.type(
    within(dialog).getByLabelText("Reason"),
    "New responsible person",
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: "End responsibility" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const write = fetcher.mock.calls.find(([, i]) => i?.method === "DELETE")!;
  expect(JSON.parse(String(write[1]?.body))).toMatchObject({
    version: 7,
    assignmentVersion: 2,
    reason: "New responsible person",
  });
});
it("authorization loss in either collection reports to the shared scope boundary", async () => {
  backend((u) =>
    u.pathname.endsWith("/routing")
      ? Response.json({ code: "not_found_or_forbidden" }, { status: 404 })
      : undefined,
  );
  const { denied } = mount();
  await waitFor(() => expect(denied).toHaveBeenCalled());
  expect(screen.queryByRole("link", { name: "Sam" })).toBeNull();
});
it("archived profiles show retained responsibilities without operational recommendations or add controls", async () => {
  backend();
  mount({ archived: true });
  await screen.findByRole("link", { name: "Sam" });
  expect(
    screen.queryByRole("button", { name: "Add contact person" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Routine" })).toBeNull();
});
