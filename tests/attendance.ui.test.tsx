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
    path: "/",
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
it("attendance roster appends cursor pages, preserves loaded members on failure and retries", async () => {
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
          : Response.json({ items: [second], nextCursor: null, summary });
      return Response.json({ items: [first], nextCursor: "next", summary });
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
it("bulk check-in uses loaded versions and reports saved and failed members separately", async () => {
  let body: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        body = JSON.parse(String(init.body));
        return Response.json({
          items: [
            {
              personId: first.id,
              outcome: "saved",
              status: "present",
              version: 1,
            },
            { personId: second.id, outcome: "conflict" },
          ],
        });
      }
      if (String(input).includes("/attendance"))
        return Response.json({
          items: [
            body ? { ...first, status: "present", version: 1 } : first,
            second,
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
    await screen.findByRole("checkbox", { name: "Select " + first.name }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Select " + second.name }),
  );
  await user.click(screen.getByRole("button", { name: "Record selected" }));
  const dialog = await screen.findByRole("dialog");
  expect(
    (within(dialog).getByLabelText("Attendance status") as HTMLSelectElement)
      .value,
  ).toBe("present");
  await user.click(
    within(dialog).getByRole("button", { name: "Save attendance" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(body?.items).toEqual([
    { personId: first.id, version: 0 },
    { personId: second.id, version: 0 },
  ]);
  expect(screen.getByText("1 saved or already recorded.")).toBeTruthy();
  expect(
    screen.getByText(/Member Two: Changed since it was loaded/),
  ).toBeTruthy();
});
it("changing saved attendance confirms before writing and the reason appears in history", async () => {
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes++;
        const value = JSON.parse(String(init.body));
        expect(value.status).toBe("unmarked");
        expect(value.reason).toBe("Incorrect entry");
        expect(value.items).toEqual([{ personId: first.id, version: 1 }]);
        return Response.json({
          items: [
            {
              personId: first.id,
              outcome: "saved",
              status: "unmarked",
              version: 2,
            },
          ],
        });
      }
      if (String(input).includes("/history"))
        return Response.json({
          items: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              createdAt: "2026-10-18T10:00:00Z",
              beforeStatus: "present",
              afterStatus: "unmarked",
              reason: "Incorrect entry",
              actorName: "Test Organizer",
              version: 2,
            },
          ],
          nextCursor: null,
        });
      if (String(input).includes("/attendance"))
        return Response.json({
          items: [
            {
              ...first,
              status: writes ? "unmarked" : "present",
              version: writes ? 2 : 1,
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
    await screen.findByRole("button", { name: "Update attendance" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.selectOptions(
    within(dialog).getByLabelText("Attendance status"),
    "unmarked",
  );
  await user.type(
    within(dialog).getByLabelText("Correction reason"),
    "Incorrect entry",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Save attendance" }),
  );
  let confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(writes).toBe(0);
  await user.click(
    within(dialog).getByRole("button", { name: "Save attendance" }),
  );
  confirm = await screen.findByRole("alertdialog");
  await user.click(
    within(confirm).getByRole("button", { name: "Confirm correction" }),
  );
  await waitFor(() => expect(writes).toBe(1));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(
    screen.getByRole("button", { name: "Actions for " + first.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Attendance history" }),
  );
  const history = await screen.findByRole("dialog");
  await within(history).findByText("Incorrect entry");
  expect(within(history).getByText("Present → Unmarked")).toBeTruthy();
});
it("unconfirmed writes keep the same request key and payload on retry without optimistic confirmation", async () => {
  const payloads: unknown[] = [];
  let effects = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        payloads.push(JSON.parse(String(init.body)));
        if (payloads.length === 1) {
          effects++;
          throw new Error("Response lost");
        }
        return Response.json({
          items: [
            {
              personId: first.id,
              outcome: "saved",
              status: "present",
              version: 1,
            },
          ],
        });
      }
      if (String(input).includes("/attendance"))
        return Response.json({
          items: [
            effects ? { ...first, status: "present", version: 1 } : first,
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
    await screen.findByRole("button", { name: "Record attendance" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Save attendance" }),
  );
  await within(dialog).findByText(
    "The save is not confirmed. Retry this same request to check its result.",
  );
  expect(
    (within(dialog).getByLabelText("Attendance status") as HTMLSelectElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByText("1 saved or already recorded.")).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  const confirm = await screen.findByRole("alertdialog");
  expect(
    within(confirm).getByRole("heading", { name: "Leave check-in" }),
  ).toBeTruthy();
  await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toEqual(payloads[1]);
  expect((payloads[0] as { status: string }).status).toBe("present");
  expect(effects).toBe(1);
  expect(screen.getByText("1 saved or already recorded.")).toBeTruthy();
});
it("volunteers cannot load private attendance records", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  mount("volunteer");
  await screen.findByRole("alert");
  expect(
    screen.getByText(
      "Attendance is currently available to owners and administrators.",
    ),
  ).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
it("future or cancelled sessions show a read-only roster with disabled write controls", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/attendance")
        ? Response.json({
            items: [first],
            nextCursor: null,
            summary: { ...summary, canEdit: false, cancelled: true },
          })
        : Response.json({ item: { ...session, cancelled: true } }),
    ),
  );
  mount();
  await screen.findByText(
    "This session is cancelled. Attendance can only be viewed.",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Record attendance",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Select " + first.name,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
