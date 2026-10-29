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
import Attendance from "../src/attendance/Attendance";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Community",
  slug: "test",
  timezone: "UTC",
  role: "owner" as const,
  createdAt: "2026-10-18T10:00:00Z",
};
const activity = "22222222-2222-4222-8222-222222222222",
  sessionId = "33333333-3333-4333-8333-333333333333";
const first = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Member One",
  createdAt: org.createdAt,
  archived: false,
  eligible: true,
  status: "unmarked",
  version: 0,
};
const second = {
  ...first,
  id: "55555555-5555-4555-8555-555555555555",
  name: "Member Two",
};
const session = {
  id: sessionId,
  activityId: activity,
  name: "Saved gathering",
  description: "",
  location: "Main room",
  timezone: "UTC",
  startsAt: "2020-01-01T10:00:00Z",
  endsAt: "2020-01-01T11:00:00Z",
  cancelled: false,
  cancellationReason: "",
  version: 1,
  createdAt: org.createdAt,
  audienceGroupIds: [],
  groups: [],
};
const summary = {
  total: 2,
  present: 0,
  absent: 0,
  excused: 0,
  unmarked: 2,
  canEdit: true,
  cancelled: false,
  startsAt: session.startsAt,
};
function mount(role = "owner") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance",
    validateSearch: (s: Record<string, unknown>) => ({
      q: s.q ?? "",
    }),
    component: () => (
      <Attendance
        organization={{ ...org, role: role as "owner" | "volunteer" }}
        userId="owner-a"
        activityId={activity}
        sessionId={sessionId}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({
      initialEntries: [
        `/workspace/${org.id}/activities/${activity}/sessions/${sessionId}/attendance`,
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
  return client;
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
const present = { ...first, status: "present", version: 1 };
const unpaid = {
  id: first.id,
  personId: first.id,
  name: first.name,
  contactVersion: 1,
  sessionVersion: 1,
  amountMinor: 1000,
  paidMinor: 0,
  outstandingMinor: 1000,
  version: 0,
  status: "not_charged",
  reviewRequired: false,
  canCharge: true,
  createdAt: first.createdAt,
};
const third = {
  ...second,
  id: "66666666-6666-4666-8666-666666666666",
  name: "Member Three",
};
async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole("button", { name: "Add participant" });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  await user.click(button);
  return screen.findByRole("dialog");
}
it("shows present contacts with combined scoped stats and no old status filters", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      Response.json(
        String(input).includes("/attendance")
          ? {
              items: [
                { ...present, billing: unpaid },
                { ...second, registered: true },
              ],
              nextCursor: null,
              summary: {
                ...summary,
                present: 1,
                paid: 0,
                unpaid: 1,
                partial: 0,
                paymentCount: 1,
                expectedMinor: 1000,
                paidMinor: 0,
                outstandingMinor: 1000,
              },
            }
          : { item: { ...session, priceMinor: 1000 } },
      ),
    ),
  );
  mount();
  await screen.findByRole("heading", { name: first.name });
  expect(screen.queryByRole("heading", { name: second.name })).toBeNull();
  expect(
    screen.getByRole("heading", { name: "Attendance & payments" }),
  ).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByText("Expected")).toBeTruthy();
  expect(screen.getByText("Recorded paid")).toBeTruthy();
});
it("batch picker displays present people greyed out and adds multiple with one command", async () => {
  let added = false;
  const writes: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://test");
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        added = true;
        return Response.json({
          items: body.items.map((p: any) => ({
            personId: p.personId,
            outcome: "saved",
          })),
        });
      }
      if (url.pathname.endsWith("/attendance"))
        return Response.json({
          items:
            url.searchParams.get("roster") === "picker"
              ? [
                  present,
                  ...[second, third].map((p) =>
                    added ? { ...p, status: "present", version: 1 } : p,
                  ),
                ]
              : [
                  present,
                  ...(added
                    ? [
                        { ...second, status: "present", version: 1 },
                        { ...third, status: "present", version: 1 },
                      ]
                    : []),
                ],
          summary,
          nextCursor: null,
        });
      return Response.json({ item: session });
    }),
  );
  mount();
  const user = userEvent.setup(),
    sheet = await openPicker(user);
  const existing = await within(sheet).findByRole("checkbox", {
    name: "Select Member One",
  });
  expect((existing as HTMLButtonElement).disabled).toBe(true);
  await user.click(
    within(sheet).getByRole("checkbox", { name: "Select Member Two" }),
  );
  await user.click(
    within(sheet).getByRole("checkbox", { name: "Select Member Three" }),
  );
  await user.click(within(sheet).getByRole("button", { name: "Add (2)" }));
  await within(sheet).findByText("Participant added.");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    action: "add",
    items: [
      { personId: second.id, version: 0 },
      { personId: third.id, version: 0 },
    ],
  });
  await waitFor(() =>
    expect(
      (
        within(sheet).getByRole("checkbox", {
          name: "Select Member Two",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true),
  );
  await user.click(within(sheet).getByRole("button", { name: "Done" }));
  await screen.findByRole("heading", { name: third.name });
});
it("bulk removal confirms once, removes rows and submits their attendance and payment versions", async () => {
  let removed = false;
  const writes: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        removed = true;
        return Response.json({
          items: body.items.map((p: any) => ({
            personId: p.personId,
            outcome: "saved",
          })),
        });
      }
      return Response.json(
        String(input).includes("/attendance")
          ? {
              items: removed
                ? []
                : [
                    {
                      ...present,
                      billing: {
                        ...unpaid,
                        status: "paid",
                        version: 2,
                        paidMinor: 1000,
                        outstandingMinor: 0,
                      },
                    },
                    {
                      ...second,
                      status: "present",
                      version: 1,
                      billing: {
                        ...unpaid,
                        id: second.id,
                        personId: second.id,
                      },
                    },
                  ],
              summary,
              nextCursor: null,
            }
          : { item: session },
      );
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("checkbox", { name: "Select Member One" }),
  );
  await user.click(screen.getByRole("checkbox", { name: "Select Member Two" }));
  await user.click(
    within(
      screen.getByText("2 of 50 members selected").parentElement!,
    ).getByRole("button", {
      name: "Remove",
    }),
  );
  const confirm = await screen.findByRole("alertdialog");
  expect(
    within(confirm).getByText(/payment records will be cleared/),
  ).toBeTruthy();
  await user.click(within(confirm).getByRole("button", { name: "Remove" }));
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: first.name })).toBeNull(),
  );
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    action: "remove",
    items: [
      { personId: first.id, version: 1, paymentVersion: 2, sessionVersion: 1 },
      { personId: second.id, version: 1, paymentVersion: 0, sessionVersion: 1 },
    ],
  });
});
it("mark paid and unpaid stay on this view and review the exact received amount", async () => {
  let paid = false;
  const writes: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        paid = body.action === "paid";
        return Response.json({
          items: [{ personId: first.id, outcome: "saved" }],
        });
      }
      return Response.json(
        String(input).includes("/attendance")
          ? {
              items: [
                {
                  ...present,
                  billing: paid
                    ? {
                        ...unpaid,
                        status: "paid",
                        paidMinor: 1000,
                        outstandingMinor: 0,
                        version: 2,
                      }
                    : unpaid,
                },
              ],
              summary,
              nextCursor: null,
            }
          : { item: { ...session, priceMinor: 1000 } },
      );
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Mark Member One paid" }),
  );
  let confirm = await screen.findByRole("alertdialog");
  expect(within(confirm).getByText(/10.*cash.*1 selected/)).toBeTruthy();
  await user.click(within(confirm).getByRole("button", { name: "Mark paid" }));
  await user.click(
    await screen.findByRole("button", { name: "Mark Member One unpaid" }),
  );
  confirm = await screen.findByRole("alertdialog");
  await user.click(
    within(confirm).getByRole("button", { name: "Mark unpaid" }),
  );
  await screen.findByRole("button", { name: "Mark Member One paid" });
  expect(writes.map((b) => b.action)).toEqual(["paid", "unpaid"]);
  expect(writes[0].items[0].amountMinor).toBe(1000);
});
it("lost bulk add response freezes choices and exact retry cannot duplicate people", async () => {
  const writes: any[] = [];
  let added = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        added = true;
        if (writes.length === 1) throw Error("lost");
        return Response.json({
          items: body.items.map((p: any) => ({
            personId: p.personId,
            outcome: "saved",
          })),
        });
      }
      return Response.json(
        String(input).includes("/attendance")
          ? { items: added ? [present] : [first], summary, nextCursor: null }
          : { item: session },
      );
    }),
  );
  mount();
  const user = userEvent.setup(),
    sheet = await openPicker(user);
  await user.click(
    await within(sheet).findByRole("checkbox", { name: "Select Member One" }),
  );
  await user.click(within(sheet).getByRole("button", { name: "Add (1)" }));
  await within(sheet).findByRole("alert");
  expect(
    (within(sheet).getByRole("button", { name: "Done" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(within(sheet).getByRole("button", { name: "Try again" }));
  await within(sheet).findByText("Participant added.");
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
});
it("pagination retains present people after a page failure", async () => {
  let attempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://test");
      if (!url.pathname.endsWith("/attendance"))
        return Response.json({ item: session });
      if (url.searchParams.has("cursor"))
        return ++attempts === 1
          ? Response.json({ code: "service" }, { status: 503 })
          : Response.json({
              items: [{ ...second, status: "present", version: 1 }],
              summary,
              nextCursor: null,
            });
      return Response.json({ items: [present], summary, nextCursor: "next" });
    }),
  );
  mount();
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: first.name });
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("heading", { name: first.name })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: second.name });
});
it("read-only sessions disable adding and removing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      Response.json(
        String(input).includes("/attendance")
          ? {
              items: [present],
              summary: { ...summary, canEdit: false, cancelled: true },
              nextCursor: null,
            }
          : { item: session },
      ),
    ),
  );
  mount();
  await screen.findByText(
    "This session is cancelled. Attendance can only be viewed.",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Add participant",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Actions for Member One" }),
  );
  expect(
    (await screen.findByRole("menuitem", { name: "Remove" })).hasAttribute(
      "data-disabled",
    ),
  ).toBe(true);
});
it("denied writes clear the private picker and list", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ code: "forbidden" }, { status: 403 })
        : Response.json(
            String(input).includes("/attendance")
              ? { items: [second], summary, nextCursor: null }
              : { item: session },
          ),
    ),
  );
  mount();
  const user = userEvent.setup(),
    sheet = await openPicker(user);
  await user.click(
    await within(sheet).findByRole("checkbox", { name: "Select Member Two" }),
  );
  await user.click(within(sheet).getByRole("button", { name: "Add (1)" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByText(second.name)).toBeNull();
});
it("attendance-only users never see financial data or paid controls", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      Response.json(
        String(input).includes("/attendance")
          ? {
              items: [{ ...present, billing: null }],
              summary: { ...summary, paid: null, paidMinor: null },
              nextCursor: null,
            }
          : { item: session },
      ),
    ),
  );
  mount();
  await screen.findByRole("heading", { name: first.name });
  expect(
    screen.queryByRole("button", { name: "Mark Member One paid" }),
  ).toBeNull();
  expect(screen.queryByText("Recorded paid")).toBeNull();
});

it.each([false, true])(
  "row actions have a single paid toggle and menu-only removal (paid=%s)",
  async (paid) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        Response.json(
          String(input).includes("/attendance")
            ? {
                items: [
                  {
                    ...present,
                    billing: paid
                      ? {
                          ...unpaid,
                          status: "paid",
                          paidMinor: 1000,
                          outstandingMinor: 0,
                        }
                      : unpaid,
                  },
                ],
                summary,
                nextCursor: null,
              }
            : { item: session },
        ),
      ),
    );
    mount();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: first.name });
    expect(
      screen.getAllByRole("button", {
        name: paid ? "Mark Member One unpaid" : "Mark Member One paid",
      }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", {
        name: "Remove Member One from attendance",
      }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Actions for Member One" }),
    );
    await screen.findByRole("menuitem", { name: "Remove" });
    expect(screen.queryByRole("menuitem", { name: "Mark unpaid" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Mark paid" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Record cash" })).toBeNull();
  },
);
it("receipt history stays inside management and loads only when expanded", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/cash"))
      return Response.json({
        items: [],
        nextCursor: null,
        summary: {
          name: session.name,
          timezone: "UTC",
          canManage: true,
          canRecord: true,
          owedMinor: 0,
          paidMinor: 0,
          outstandingMinor: 0,
          collectedMinor: 0,
          unallocatedMinor: 0,
        },
      });
    return Response.json(
      url.includes("/attendance")
        ? { items: [present], summary, nextCursor: null }
        : { item: { ...session, priceMinor: 1000 } },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  mount();
  await screen.findByRole("heading", { name: first.name });
  expect(
    fetcher.mock.calls.some(([input]) => String(input).includes("/cash")),
  ).toBe(false);
  await userEvent.setup().click(screen.getByText("Receipt history"));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([input]) =>
        String(input).includes("/cash?view=history"),
      ),
    ).toBe(true),
  );
  expect(screen.queryByRole("heading", { name: "Payments" })).toBeNull();
});

it("payment-only staff use the shared management view without attendance reads", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/access/me"))
      return Response.json({ item: { canAttend: false, canCollect: true } });
    return Response.json({
      items: [unpaid],
      nextCursor: null,
      summary: {
        name: session.name,
        timezone: "UTC",
        canManage: false,
        canRecord: true,
        owedMinor: 1000,
        paidMinor: 0,
        outstandingMinor: 1000,
        collectedMinor: null,
        unallocatedMinor: null,
      },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  mount("volunteer");
  await screen.findByRole("heading", { name: "Attendance & payments" });
  await screen.findByText(first.name);
  expect(
    fetcher.mock.calls.some(([input]) => String(input).includes("/attendance")),
  ).toBe(false);
  expect(screen.queryByRole("button", { name: "Add participant" })).toBeNull();
  expect(screen.queryByText("Present")).toBeNull();
});
