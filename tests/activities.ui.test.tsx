import { Workflow } from "../src/organization/WorkflowPage";
import type { PageForm } from "../src/components/shared/form-navigation";
import { beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  within,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
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
import Activities from "../src/activities/Activities";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Community",
  slug: "test",
  timezone: "Europe/Brussels",
  role: "owner" as const,
  createdAt: "2026-10-18T10:00:00Z",
};
const item = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Community evening",
  description: "A shared activity",
  location: "Main room",
  timezone: org.timezone,
  version: 1,
  cancelled: false,
  createdAt: org.createdAt,
  audienceGroupIds: [],
  groups: [],
  nextSession: null,
};
const session = {
  ...item,
  id: "33333333-3333-4333-8333-333333333333",
  activityId: item.id,
  name: "Saved session name",
  startsAt: "2099-11-06T17:00:00Z",
  endsAt: "2099-11-06T18:00:00Z",
  cancellationReason: "",
};
function mount(
  role = "owner",
  activityId: string | null = null,
  sessionId: string | null = null,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <Activities
        organization={{ ...org, role: role as "owner" | "volunteer" }}
        userId="owner-a"
        activityId={activityId}
        sessionId={sessionId}
      />
    ),
  });
  const workflow = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/forms/$form/$recordId",
    component: () => {
      const { form, recordId } = workflow.useParams();
      return (
        <Workflow
          user="owner-a"
          organization={org}
          form={form as PageForm}
          recordId={recordId}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([index, workflow]),
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
it("activity pages append, retain loaded rows after pagination failure, and retry", async () => {
  let attempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://test");
      if (url.searchParams.has("cursor"))
        return ++attempts === 1
          ? Response.json({ code: "service" }, { status: 503 })
          : Response.json({
              items: [
                {
                  ...item,
                  id: "44444444-4444-4444-8444-444444444444",
                  name: "Next activity",
                },
              ],
              nextCursor: null,
            });
      return Response.json({ items: [item], nextCursor: "next" });
    }),
  );
  mount();
  const user = userEvent.setup();
  await screen.findByText(item.name);
  expect(
    screen.getByRole("link", { name: "View activity" }).getAttribute("href"),
  ).toBe(`/workspace/${org.id}/activities/${item.id}`);
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByText(item.name)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Next activity");
});
it("archiving an activity requires confirmation and sends the expected version", async () => {
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        writes++;
        expect(JSON.parse(String(init.body))).toEqual({
          version: 1,
          cancelled: true,
        });
        return Response.json({
          item: { ...item, cancelled: true, version: 2 },
        });
      }
      return Response.json({ items: writes ? [] : [item], nextCursor: null });
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for " + item.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Archive activity" }),
  );
  let confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(writes).toBe(0);
  await user.click(
    screen.getByRole("button", { name: "Actions for " + item.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Archive activity" }),
  );
  confirm = await screen.findByRole("alertdialog");
  await user.click(
    within(confirm).getByRole("button", { name: "Archive activity" }),
  );
  await waitFor(() => expect(writes).toBe(1));
  await screen.findByText("No activities here yet.");
});
it("session detail loads by ID, shows the saved audience and is read-only for volunteers", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) =>
    Response.json({
      item: String(input).includes("/sessions/")
        ? {
            ...session,
            groups: [{ id: "group-a", name: "Saved group", archived: false }],
          }
        : item,
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  mount("volunteer", item.id, session.id);
  await screen.findByRole("heading", { name: session.name });
  const back = screen.getByRole("link", { name: item.name });
  expect(back.getAttribute("href")).toBe(
    `/workspace/${org.id}/activities/${item.id}`,
  );
  expect(screen.getAllByRole("link").length).toBe(1);
  expect(screen.queryByRole("link", { name: "Activities" })).toBeNull();
  expect(screen.getByText("Saved group")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    fetcher.mock.calls.every((call) => !String(call[0]).includes("?")),
  ).toBe(true);
});
it("creation errors preserve metadata and the same idempotency key; dirty cancel confirms", async () => {
  const keys: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const value = JSON.parse(String(init.body));
        keys.push(value.key);
        return Response.json({ code: "invalid_name" }, { status: 400 });
      }
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Create activity" }),
  );
  const dialog = await screen.findByRole("region", {
    name: /Create activity|Add members|Add relationship|Add relationship type|Edit relationship type|Add contact person/,
  });
  await user.type(
    within(dialog).getByLabelText("Activity name"),
    "Service day",
  );
  expect(within(dialog).queryByLabelText("Starts")).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByRole("alert");
  expect(
    (within(dialog).getByLabelText("Activity name") as HTMLInputElement).value,
  ).toBe("Service day");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(keys.length).toBe(2));
  expect(keys[0]).toBe(keys[1]);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  const confirm = await screen.findByRole("alertdialog");
  await user.click(
    within(confirm).getByRole("button", { name: "Discard changes" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("group audience picker fetches bounded pages, retains selected IDs and appends", async () => {
  let payload: Record<string, unknown> | undefined;
  const one = {
      id: "55555555-5555-4555-8555-555555555555",
      name: "First group",
    },
    two = { id: "66666666-6666-4666-8666-666666666666", name: "Second group" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        payload = JSON.parse(String(init.body));
        return Response.json({ item });
      }
      const url = new URL(String(input), "https://test");
      if (
        url.pathname.endsWith("/groups") &&
        url.pathname !== `/api/organizations/${org.id}/people/groups`
      )
        return Response.json({ code: "not_found" }, { status: 404 });
      if (url.pathname === `/api/organizations/${org.id}/people/groups`)
        return Response.json({
          items: url.searchParams.has("cursor") ? [two] : [one],
          nextCursor: url.searchParams.has("cursor") ? null : "more",
        });
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Create activity" }),
  );
  const dialog = await screen.findByRole("region", {
    name: /Create activity|Add members|Add relationship|Add relationship type|Edit relationship type|Add contact person/,
  });
  await user.type(
    within(dialog).getByLabelText("Activity name"),
    "Youth gathering",
  );
  await user.selectOptions(within(dialog).getByLabelText("Audience"), "groups");
  await user.click(
    await within(dialog).findByRole("checkbox", { name: one.name }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Load more" }));
  await user.click(
    await within(dialog).findByRole("checkbox", { name: two.name }),
  );
  expect(within(dialog).getByText("2 of 20 groups selected")).toBeTruthy();
  expect(payload).toBeUndefined();
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(payload?.audienceGroupIds).toEqual([one.id, two.id]),
  );
});
it("session tabs load their own paginated view and future session form sends parent version", async () => {
  let payload: Record<string, unknown> | undefined;
  const views: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://test");
      if (init?.method === "POST") {
        payload = JSON.parse(String(init.body));
        return Response.json({ item: session });
      }
      if (url.pathname.endsWith("/sessions")) {
        views.push(url.searchParams.get("view")!);
        return Response.json({ items: [], nextCursor: null });
      }
      return Response.json({ item });
    }),
  );
  const client = mount("owner", item.id);
  const user = userEvent.setup();
  const back = await screen.findByRole("link", { name: "Activities" });
  expect(back.getAttribute("href")).toBe(`/workspace/${org.id}/activities`);
  expect(screen.getAllByRole("link").length).toBe(1);
  await user.click(await screen.findByRole("tab", { name: "Past" }));
  await waitFor(() => expect(views).toContain("past"));
  await user.click(screen.getByRole("tab", { name: "Upcoming" }));
  await user.click(screen.getByRole("button", { name: "Schedule session" }));
  const dialog = await screen.findByRole("dialog");
  await act(async () => {
    client.setQueryData(
      ["organization", "owner-a", org.id, "activities", "detail", item.id],
      { item: { ...item, version: 2 } },
    );
  });
  expect(
    (within(dialog).getByLabelText("Location (optional)") as HTMLInputElement)
      .value,
  ).toBe(item.location);
  const end = within(dialog).getByLabelText("Ends") as HTMLInputElement;
  fireEvent.change(within(dialog).getByLabelText("Starts"), {
    target: { value: "2099-12-31T23:45" },
  });
  expect(end.value).toBe("2100-01-01T00:45");
  fireEvent.change(within(dialog).getByLabelText("Starts"), {
    target: { value: "2099-11-06T18:00" },
  });
  expect(end.value).toBe("2099-11-06T19:00");
  fireEvent.change(within(dialog).getByLabelText("Ends"), {
    target: { value: "2099-11-06T19:30" },
  });
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(payload?.version).toBe(1));
  expect(payload?.startLocal).toBe("2099-11-06T18:00");
  expect(payload?.endLocal).toBe("2099-11-06T19:30");
});
it("session cancellation preserves its reason and confirmation cancellation does not write", async () => {
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        writes++;
        expect(JSON.parse(String(init.body))).toEqual({
          cancelled: true,
          version: 1,
          reason: "Room unavailable",
        });
        return Response.json({
          item: {
            ...session,
            cancelled: true,
            cancellationReason: "Room unavailable",
          },
        });
      }
      return Response.json({
        item: String(input).includes("/sessions/") ? session : item,
      });
    }),
  );
  mount("owner", item.id, session.id);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Actions for/ }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Cancel session" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Cancellation reason (optional)"),
    "Room unavailable",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Cancel session" }),
  );
  let confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(writes).toBe(0);
  expect(screen.getByRole("dialog")).toBeTruthy();
  await user.click(
    within(dialog).getByRole("button", { name: "Cancel session" }),
  );
  confirm = await screen.findByRole("alertdialog");
  await user.click(
    within(confirm).getByRole("button", { name: "Cancel session" }),
  );
  await waitFor(() => expect(writes).toBe(1));
});

it("started session details remain read-only for an owner", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      Response.json({
        item: String(input).includes("/sessions/")
          ? {
              ...session,
              startsAt: "2020-01-01T10:00Z",
              endsAt: "2020-01-01T11:00Z",
            }
          : item,
      }),
    ),
  );
  mount("owner", item.id, session.id);
  await screen.findByRole("heading", { name: session.name });
  expect(screen.getByRole("button", { name: /Actions for/ })).toBeTruthy();
  expect(
    screen
      .getAllByRole("link")
      .filter((link) => link.hasAttribute("data-slot")),
  ).toHaveLength(2);

  expect(
    screen
      .getByRole("link", { name: "Manage attendance & payments" })
      .getAttribute("href"),
  ).toBe(
    `/workspace/${org.id}/activities/${item.id}/sessions/${session.id}/attendance`,
  );
  expect(
    screen.getByText(
      "The session’s schedule and details are read-only once it starts.",
    ),
  ).toBeTruthy();
});

it("session list has one primary action and operational shortcuts in its more menu", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) =>
    Response.json(
      String(input).includes("/sessions")
        ? {
            items: [
              {
                ...session,
                registration: {
                  mode: "required",
                  capacity: 12,
                  confirmed: 12,
                  remaining: 0,
                },
              },
            ],
            nextCursor: null,
          }
        : { item },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  mount("owner", item.id);
  await screen.findByText("Fully booked");
  expect(screen.getByText("Reserved places: 12")).toBeTruthy();
  const card = screen.getByText("Fully booked").closest("article")!;
  expect(within(card).getAllByRole("link")).toHaveLength(1);
  expect(
    within(card)
      .getByRole("link", { name: "View session" })
      .getAttribute("href"),
  ).toContain(`/sessions/${session.id}`);
  expect(within(card).getByRole("link").getAttribute("data-variant")).toBe(
    "default",
  );
  await userEvent
    .setup()
    .click(within(card).getByRole("button", { name: /Actions for/ }));
  expect(
    await screen.findByRole("menuitem", { name: "Registrations" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("menuitem", { name: "Manage attendance & payments" }),
  ).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([
  {
    mode: "open",
    capacity: null,
    confirmed: 0,
    remaining: null,
    text: "No reservation limit",
    cancelled: false,
  },
  {
    mode: "required",
    capacity: 10,
    confirmed: 3,
    remaining: 7,
    text: "7 places left · capacity 10",
    cancelled: true,
  },
])(
  "session summary handles optional, limited and closed sessions: $text",
  async (registration) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        Response.json(
          String(input).includes("/sessions")
            ? {
                items: [
                  {
                    ...session,
                    canAttend: true,
                    cancelled: registration.cancelled,
                    registration,
                  },
                ],
                nextCursor: null,
              }
            : { item },
        ),
      ),
    );
    mount("volunteer", item.id);
    await screen.findByText(registration.text);
    expect(
      screen.getByText(
        "You only see contacts within your current staff access.",
      ),
    ).toBeTruthy();
    if (registration.cancelled)
      expect(
        screen.getByText("Registration is closed for this session."),
      ).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Actions for/ }));
    expect(
      await screen.findByRole("menuitem", { name: "Registrations" }),
    ).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Edit session" })).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: "Cancel session" }),
    ).toBeNull();
  },
);

it("session detail shows a compact attendance and payment summary", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/attendance"))
        return Response.json({
          summary: {
            present: 3,
            paid: 2,
            unpaid: 1,
            partial: 0,
            paymentCount: 3,
            expectedMinor: 3000,
            paidMinor: 2000,
            outstandingMinor: 1000,
          },
        });
      return Response.json({
        item: String(input).includes("/sessions/")
          ? { ...session, priceMinor: 1000 }
          : item,
      });
    }),
  );
  mount("owner", item.id, session.id);
  await waitFor(() =>
    expect(document.querySelectorAll(".session-stats-compact dd")).toHaveLength(
      3,
    ),
  );
  expect(
    [...document.querySelectorAll(".session-stats-compact dd")].map(
      (node) => node.textContent,
    ),
  ).toEqual(["3", "2", "1"]);
  expect(screen.queryByText("Expected")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Manage attendance & payments" }),
  ).toBeTruthy();
});

it("permanently deletes active or archived activities only after reviewing the complete impact", async () => {
  let deleted = false,
    writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        writes++;
        deleted = true;
        return Response.json({ deleted: true });
      }
      if (String(input).includes("deletionPreview=true"))
        return Response.json({
          name: item.name,
          snapshot: "a".repeat(32),
          sessions: 2,
          attendance: 8,
          charges: 5,
          receipts: 6,
        });
      return Response.json({
        items: deleted ? [] : [{ ...item, cancelled: true }],
        nextCursor: null,
      });
    }),
  );
  const cache = mount();
  cache.setQueryData(
    ["organization", "owner-a", org.id, "insights", "fixture"],
    { old: true },
  );
  cache.setQueryData(
    ["organization", "owner-a", org.id, "dashboard", "fixture"],
    { old: true },
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for " + item.name }),
  );
  expect(
    screen.queryByRole("menuitem", { name: "Archive activity" }),
  ).toBeNull();
  await user.click(
    await screen.findByRole("menuitem", { name: "Permanently delete" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  expect(
    within(dialog).getByText(
      /2 sessions, 8 attendance entries, 5 charges and 6 payment records/,
    ),
  ).toBeTruthy();
  expect(writes).toBe(0);
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(writes).toBe(0);
  await user.click(
    screen.getByRole("button", { name: "Actions for " + item.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Permanently delete" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Permanently delete",
    }),
  );
  await waitFor(() => expect(writes).toBe(1));
  await waitFor(() =>
    expect(
      cache.getQueryData([
        "organization",
        "owner-a",
        org.id,
        "insights",
        "fixture",
      ]),
    ).toBeUndefined(),
  );
  expect(
    cache.getQueryData([
      "organization",
      "owner-a",
      org.id,
      "dashboard",
      "fixture",
    ]),
  ).toBeUndefined();
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Actions for " + item.name }),
    ).toBeNull(),
  );
});
it("retries a lost deletion response with the same reviewed request identity", async () => {
  const bodies: string[] = [];
  let previews = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        bodies.push(String(init.body));
        if (bodies.length === 1) throw Error("Lost response");
        return Response.json({ deleted: true });
      }
      if (String(input).includes("deletionPreview=true")) {
        previews++;
        return Response.json({
          name: item.name,
          snapshot: "a".repeat(32),
          sessions: 2,
          attendance: 8,
          charges: 5,
          receipts: 6,
        });
      }
      return Response.json({
        items: bodies.length > 1 ? [] : [item],
        nextCursor: null,
      });
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for " + item.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Permanently delete" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Permanently delete",
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(bodies).toHaveLength(2));
  expect(bodies[0]).toBe(bodies[1]);
  expect(previews).toBe(1);
});
it("requires a new review after a deletion snapshot conflict", async () => {
  const bodies: string[] = [];
  let previews = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        bodies.push(String(init.body));
        return bodies.length === 1
          ? Response.json({ code: "conflict" }, { status: 409 })
          : Response.json({ deleted: true });
      }
      if (String(input).includes("deletionPreview=true")) {
        previews++;
        return Response.json({
          name: item.name,
          snapshot: (previews === 1 ? "a" : "b").repeat(32),
          sessions: previews,
          attendance: 8,
          charges: 5,
          receipts: 6,
        });
      }
      return Response.json({
        items: bodies.length > 1 ? [] : [item],
        nextCursor: null,
      });
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Actions for " + item.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Permanently delete" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Permanently delete",
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Try again" }));
  const second = await screen.findByRole("alertdialog");
  expect(within(second).getByText(/2 sessions/)).toBeTruthy();
  expect(bodies).toHaveLength(1);
  await user.click(
    within(second).getByRole("button", { name: "Permanently delete" }),
  );
  await waitFor(() => expect(bodies).toHaveLength(2));
  expect(JSON.parse(bodies[0]!).key).not.toBe(JSON.parse(bodies[1]!).key);
});

it("schedules an optional topic without autofocus and keeps the activity name unchanged", async () => {
  let payload: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        payload = JSON.parse(String(init.body));
        return Response.json({
          item: { ...session, topic: "Patience in everyday life" },
        });
      }
      if (String(input).includes("/sessions"))
        return Response.json({ items: [], nextCursor: null });
      return Response.json({ item });
    }),
  );
  mount("owner", item.id);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Schedule session" }),
  );
  const dialog = await screen.findByRole("dialog"),
    topic = within(dialog).getByLabelText(
      "Topic or title (optional)",
    ) as HTMLInputElement;
  expect(topic.required).toBe(false);
  expect(topic.maxLength).toBe(160);
  expect(document.activeElement).not.toBe(topic);
  await user.type(topic, "Patience in everyday life");
  fireEvent.change(within(dialog).getByLabelText("Starts"), {
    target: { value: "2099-11-06T18:00" },
  });
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(payload?.topic).toBe("Patience in everyday life"));
  await waitFor(() => expect(payload?.name).toBe(item.name));
});
it("uses the topic as the session title, with activity context, and supports clearing it", async () => {
  let payload: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        payload = JSON.parse(String(init.body));
        return Response.json({ item: { ...session, topic: "" } });
      }
      return Response.json({
        item: String(input).includes("/sessions/")
          ? { ...session, topic: "Patience in everyday life" }
          : item,
      });
    }),
  );
  mount("owner", item.id, session.id);
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Patience in everyday life" });
  expect(screen.getByText(session.name)).toBeTruthy();
  await user.click(await screen.findByRole("button", { name: /Actions for/ }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Edit session" }),
  );
  const dialog = await screen.findByRole("dialog");
  const topic = within(dialog).getByLabelText("Topic or title (optional)");
  expect((topic as HTMLInputElement).value).toBe("Patience in everyday life");
  await user.clear(topic);
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(payload?.topic).toBe(""));
});
