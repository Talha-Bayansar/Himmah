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
import RegistrationPage, {
  type RegistrationFilters,
} from "../src/registration/RegistrationPage";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
const org = "11111111-1111-4111-8111-111111111111",
  activity = "22222222-2222-4222-8222-222222222222",
  session = "33333333-3333-4333-8333-333333333333",
  person = "44444444-4444-4444-8444-444444444444",
  at = "2026-10-28T10:00:00Z";
const summary = {
  mode: "required",
  capacity: 25,
  version: 1,
  confirmed: 1,
  remaining: 24,
  expected: 1,
  originalExpected: 1,
  frozenAt: null,
  checkInOpensAt: "2099-11-06T16:30:00Z",
  canManage: true,
  canConfigure: true,
  canRegister: true,
  cancelled: false,
};
const row = {
  id: person,
  personId: person,
  name: "Ali",
  status: "confirmed",
  source: "advance",
  version: 3,
  createdAt: at,
  initial: null,
  included: null,
};
function backend(
  handler?: (u: URL, init?: RequestInit) => Response | undefined,
) {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input), "https://himmah.test"),
        response = handler?.(u, init);
      if (response) return response;
      const organization = {
        id: org,
        name: "Community",
        slug: "community",
        timezone: "UTC",
        role: "owner",
        createdAt: at,
      };
      if (u.pathname === "/api/account")
        return Response.json({ user: { id: "owner", emailVerified: true } });
      if (u.pathname === "/api/organizations")
        return Response.json({
          organizations: [organization],
          nextCursor: null,
        });
      if (u.pathname === "/api/organizations/" + org)
        return Response.json({ organization });
      if (u.pathname.endsWith("/notifications/unread"))
        return Response.json({ count: 0 });
      if (u.pathname.endsWith("/sessions/" + session))
        return Response.json({
          item: {
            id: session,
            activityId: activity,
            name: "Friday gathering",
            timezone: "UTC",
            startsAt: "2099-11-06T17:00:00Z",
            endsAt: "2099-11-06T18:00:00Z",
            version: 1,
            groups: [],
            audienceGroupIds: [],
            cancelled: false,
          },
        });
      if (u.pathname.endsWith("/options"))
        return Response.json({
          items: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              name: "Bob",
              contactVersion: 4,
              version: 0,
              createdAt: at,
            },
          ],
          nextCursor: null,
        });
      if (init?.method === "POST")
        return Response.json({ id: person, version: 4 });
      return Response.json({ items: [row], summary, nextCursor: null });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mount(search = "") {
  const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
    root = createRootRoute({ component: () => <Outlet /> });
  const page = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/registrations",
    validateSearch: (s: Record<string, unknown>) =>
      ({
        q: String(s.q ?? ""),
        view: String(s.view ?? "confirmed"),
      }) as RegistrationFilters,
    component: () => {
      const p = page.useParams(),
        filters = page.useSearch(),
        navigate = page.useNavigate();
      return (
        <RegistrationPage
          {...p}
          filters={filters}
          onFiltersChange={(search) => void navigate({ search, replace: true })}
        />
      );
    },
  });
  const back = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId",
    component: () => <p>Session details</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([page, back]),
    history: createMemoryHistory({
      initialEntries: [
        `/workspace/${org}/activities/${activity}/sessions/${session}/registrations` +
          search,
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
beforeEach(() => {
  setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("loads session metadata and reservations independently and keeps view/search in the URL", async () => {
  const fetcher = backend(),
    { router } = mount("?view=expected&q=Ali");
  await screen.findByRole("heading", { name: "Registrations" });
  expect(screen.getByText("Ali")).toBeTruthy();
  expect(screen.getByText("Expected contacts: 1")).toBeTruthy();
  expect(
    fetcher.mock.calls.some(
      ([u]) =>
        String(u).includes("/sessions/" + session) &&
        !String(u).includes("/registrations"),
    ),
  ).toBe(true);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Show"), "original");
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      view: "original",
      q: "Ali",
    }),
  );
  expect(screen.getByText(/reservation does not mark attendance/)).toBeTruthy();
});
it("bottom-sheet reservation retries retain the selected contact and exact request, without marking attendance", async () => {
  const writes: Record<string, unknown>[] = [];
  const fetcher = backend((u, init) => {
    if (init?.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      return writes.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ id: person });
    }
  });
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Register contact" }),
  );
  const sheet = await screen.findByRole("dialog");
  expect(sheet.getAttribute("data-slot")).toBe("drawer-content");
  expect(document.activeElement?.matches("input,textarea,select")).toBe(false);
  await user.click(await within(sheet).findByRole("button", { name: "Bob" }));
  await user.click(within(sheet).getByRole("button", { name: "Save" }));
  await within(sheet).findByRole("alert");
  await user.click(within(sheet).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]).toMatchObject({
    action: "register",
    contactVersion: 4,
    version: 0,
    reason: "",
  });
  expect(
    fetcher.mock.calls.some(([u]) => String(u).includes("/attendance")),
  ).toBe(false);
});
it("cancellation requires a reason and confirmation, preserving the reservation on cancel", async () => {
  const writes: Record<string, unknown>[] = [];
  backend((u, init) => {
    if (init?.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      return Response.json({ id: person });
    }
  });
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for Ali" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Cancel registration" }),
  );
  const sheet = await screen.findByRole("dialog");
  await user.type(within(sheet).getByLabelText("Reason"), "Cannot attend");
  await user.click(within(sheet).getByRole("button", { name: "Save" }));
  let confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(writes).toHaveLength(0);
  await user.click(within(sheet).getByRole("button", { name: "Save" }));
  confirm = await screen.findByRole("alertdialog");
  await user.click(
    within(confirm).getByRole("button", { name: "Cancel registration" }),
  );
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    action: "cancel",
    version: 3,
    personId: person,
    reason: "Cannot attend",
  });
});
it("configures a finite capacity and required registration in a short sheet", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend((u, init) => {
    if (init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({ version: 2 });
    }
  });
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Registration settings" }),
  );
  const sheet = await screen.findByRole("dialog");
  const capacity = within(sheet).getByLabelText(
    "Maximum reservations (optional)",
  );
  await user.clear(capacity);
  await user.type(capacity, "30");
  await user.click(within(sheet).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(submitted).toMatchObject({
      action: "configure",
      version: 1,
      mode: "required",
      capacity: 30,
    }),
  );
});
it("current permission loss hides cached names and clears registration data", async () => {
  let lost = false;
  backend((u) =>
    lost && u.pathname.endsWith("/registrations")
      ? Response.json({ code: "forbidden" }, { status: 403 })
      : undefined,
  );
  const { client } = mount();
  await screen.findByText("Ali");
  lost = true;
  await client.invalidateQueries({
    queryKey: ["organization", "owner", org, "activities", "registrations"],
  });
  await screen.findByRole("alert");
  expect(screen.queryByText("Ali")).toBeNull();
  expect(
    client.getQueriesData({
      queryKey: ["organization", "owner", org, "activities"],
    }),
  ).toHaveLength(0);
});
it("restricted staff cannot see settings, cancellations or organization-wide history", async () => {
  backend((u) =>
    u.pathname.endsWith("/registrations")
      ? Response.json({
          items: [row],
          summary: {
            ...summary,
            canManage: false,
            canConfigure: false,
            canRegister: false,
          },
          nextCursor: null,
        })
      : undefined,
  );
  mount();
  await screen.findByText("Ali");
  expect(screen.queryByRole("button", { name: "Register contact" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Actions for Ali" })).toBeNull();
  expect(screen.queryByRole("option", { name: "Change history" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Registration settings" }),
  ).toBeNull();
});

it("policy edits retain the opened version when a background refresh changes the settings", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend((u, init) => {
    if (init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({ code: "conflict" }, { status: 409 });
    }
  });
  const { client } = mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Registration settings" }),
  );
  const sheet = await screen.findByRole("dialog");
  client.setQueryData(
    [
      "organization",
      "owner",
      org,
      "activities",
      "registrations",
      activity,
      session,
      "confirmed",
      "",
    ],
    {
      pages: [
        {
          items: [row],
          summary: { ...summary, version: 2, capacity: 40 },
          nextCursor: null,
        },
      ],
      pageParams: [null],
    },
  );
  await user.click(within(sheet).getByRole("button", { name: "Save" }));
  await within(sheet).findByRole("alert");
  expect(submitted).toMatchObject({ version: 1, capacity: 25 });
});
it("reveals the amendment reason if check-in opens while the reservation sheet is already open", async () => {
  const writes: Record<string, unknown>[] = [];
  backend((u, init) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      return body.reason
        ? Response.json({ id: person })
        : Response.json({ code: "registration_reason" }, { status: 409 });
    }
  });
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Register contact" }),
  );
  const sheet = await screen.findByRole("dialog");
  await user.click(await within(sheet).findByRole("button", { name: "Bob" }));
  await user.click(within(sheet).getByRole("button", { name: "Save" }));
  await user.type(
    await within(sheet).findByLabelText("Reason"),
    "Late reservation",
  );
  await user.click(within(sheet).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(writes[1]).toMatchObject({ reason: "Late reservation" });
});

it.each([null, 25])(
  "locked settings remain discoverable with the saved capacity %s",
  async (capacity) => {
    backend((u) =>
      u.pathname.endsWith("/registrations")
        ? Response.json({
            items: [],
            nextCursor: null,
            summary: {
              ...summary,
              capacity,
              remaining: capacity === null ? null : 24,
              canConfigure: false,
            },
          })
        : undefined,
    );
    mount();
    const settings = await screen.findByRole("button", {
      name: "Registration settings",
    });
    expect((settings as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(
        "Settings lock 30 minutes before start or when the session is cancelled.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        capacity === null
          ? "No reservation limit"
          : "24 places left · capacity 25",
      ),
    ).toBeTruthy();
    await userEvent.setup().click(settings);
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);
