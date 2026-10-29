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
async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole("button", { name: "Add participant" });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  await user.click(button);
  return screen.findByRole("dialog");
}
it("only present contacts render and there are no status filters, badges or selection checkboxes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://test");
      if (url.pathname.endsWith("/attendance")) {
        expect(url.searchParams.get("roster")).toBe("participants");
        return Response.json({
          items: [present, { ...second, registered: true, expected: true }],
          nextCursor: null,
          summary: { ...summary, present: 1 },
        });
      }
      return Response.json({ item: session });
    }),
  );
  mount();
  await screen.findByRole("heading", { name: first.name });
  expect(screen.queryByRole("heading", { name: second.name })).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByText("Present")).toBeNull();
  expect(screen.getByText("1 present")).toBeTruthy();
});
it("picker excludes present people and one selection adds attendance without a status form", async () => {
  let added = false;
  const writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://test");
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        added = true;
        return Response.json({
          items: [{ personId: second.id, outcome: "saved" }],
        });
      }
      if (url.pathname.endsWith("/attendance"))
        return Response.json({
          items:
            url.searchParams.get("roster") === "available"
              ? [
                  present,
                  added ? { ...second, status: "present", version: 1 } : second,
                ]
              : added
                ? [present, { ...second, status: "present", version: 1 }]
                : [present],
          nextCursor: null,
          summary,
        });
      return Response.json({ item: session });
    }),
  );
  mount();
  const user = userEvent.setup();
  const sheet = await openPicker(user);
  await within(sheet).findByText(second.name);
  expect(within(sheet).queryByText(first.name)).toBeNull();
  await user.click(
    within(sheet).getByRole("button", { name: "Select Member Two" }),
  );
  await within(sheet).findByText("Participant added.");
  await waitFor(() =>
    expect(
      within(sheet).queryByRole("button", { name: "Select Member Two" }),
    ).toBeNull(),
  );
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    action: "add",
    personId: second.id,
    version: 0,
  });
  expect(within(sheet).queryByRole("combobox")).toBeNull();
  await user.click(within(sheet).getByRole("button", { name: "Done" }));
  await screen.findByRole("heading", { name: second.name });
});
it("removal confirms, hides the person, preserves cash and makes re-adding possible", async () => {
  let removed = false;
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://test");
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        removed = body.action === "remove";
        return Response.json({
          items: [{ personId: first.id, outcome: "saved" }],
        });
      }
      if (url.pathname.endsWith("/attendance"))
        return Response.json({
          items:
            url.searchParams.get("roster") === "available"
              ? removed
                ? [{ ...first, version: 2 }]
                : []
              : removed
                ? []
                : [
                    {
                      ...present,
                      billing: {
                        ...unpaid,
                        status: "paid",
                        paidMinor: 1000,
                        outstandingMinor: 0,
                      },
                    },
                  ],
          nextCursor: null,
          summary,
        });
      return Response.json({ item: session });
    }),
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", {
      name: "Remove Member One from attendance",
    }),
  );
  let confirmation = await screen.findByRole("alertdialog");
  await user.click(
    within(confirmation).getByRole("button", { name: "Cancel" }),
  );
  expect(writes).toHaveLength(0);
  await user.click(
    screen.getByRole("button", { name: "Remove Member One from attendance" }),
  );
  confirmation = await screen.findByRole("alertdialog");
  await user.click(
    within(confirmation).getByRole("button", { name: "Remove" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: first.name })).toBeNull(),
  );
  expect(writes[0]).toMatchObject({
    action: "remove",
    personId: first.id,
    version: 1,
  });
  const sheet = await openPicker(user);
  await user.click(
    await within(sheet).findByRole("button", { name: "Select Member One" }),
  );
  await within(sheet).findByText("Participant added.");
  expect(writes[1]).toMatchObject({
    action: "add",
    personId: first.id,
    version: 2,
  });
  expect(writes.every((body) => !Object.hasOwn(body, "amountMinor"))).toBe(
    true,
  );
  await user.click(within(sheet).getByRole("button", { name: "Done" }));
  await screen.findByText("Paid");
});
it("a lost add response freezes the picker and retries the exact command", async () => {
  const writes: unknown[] = [];
  let added = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://test");
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        added = true;
        if (writes.length === 1) throw Error("Lost response");
        return Response.json({
          items: [{ personId: first.id, outcome: "saved" }],
        });
      }
      if (url.pathname.endsWith("/attendance"))
        return Response.json({
          items:
            url.searchParams.get("roster") === "available"
              ? added
                ? []
                : [first]
              : added
                ? [present]
                : [],
          summary,
          nextCursor: null,
        });
      return Response.json({ item: session });
    }),
  );
  mount();
  const user = userEvent.setup();
  const sheet = await openPicker(user);
  await user.click(
    await within(sheet).findByRole("button", { name: "Select Member One" }),
  );
  await within(sheet).findByRole("alert");
  expect(
    (within(sheet).getByRole("button", { name: "Done" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (
      within(sheet).getByRole("button", {
        name: "Select Member One",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await user.click(within(sheet).getByRole("button", { name: "Try again" }));
  await within(sheet).findByText("Participant added.");
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
});
it("roster pagination retains loaded present people after a page failure", async () => {
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
  expect(
    (
      screen.getByRole("button", {
        name: "Remove Member One from attendance",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("a denied write clears the private picker and list", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST")
        return Response.json({ code: "forbidden" }, { status: 403 });
      return Response.json(
        String(input).includes("/attendance")
          ? { items: [second], summary, nextCursor: null }
          : { item: session },
      );
    }),
  );
  mount();
  const user = userEvent.setup();
  const sheet = await openPicker(user);
  await user.click(
    await within(sheet).findByRole("button", { name: "Select Member Two" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByText(second.name)).toBeNull();
  await screen.findByRole("alert");
});
it("attendance-only staff have no financial controls", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      Response.json(
        String(input).includes("/attendance")
          ? {
              items: [{ ...present, billing: null }],
              summary,
              nextCursor: null,
            }
          : { item: session },
      ),
    ),
  );
  mount();
  await screen.findByRole("heading", { name: first.name });
  expect(
    screen.queryByRole("button", { name: "Record payment for Member One" }),
  ).toBeNull();
  expect(screen.queryByText("Unpaid")).toBeNull();
});
it("payment stays directly accessible on the present list", async () => {
  let paid = false;
  let payload: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        payload = JSON.parse(String(init.body));
        paid = true;
        return Response.json({ id: second.id });
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
                      }
                    : unpaid,
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
    await screen.findByRole("button", {
      name: "Record payment for Member One",
    }),
  );
  const sheet = await screen.findByRole("dialog");
  await user.click(
    within(sheet).getByRole("button", { name: /Record.*10.*cash/ }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await screen.findByText("Paid");
  expect(payload).toMatchObject({ action: "record", amountMinor: 1000 });
  expect(
    screen.queryByRole("button", { name: "Record payment for Member One" }),
  ).toBeNull();
});
