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
      if (url.pathname.endsWith("/groups"))
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
  fireEvent.change(within(dialog).getByLabelText("Starts"), {
    target: { value: "2099-11-06T18:00" },
  });
  fireEvent.change(within(dialog).getByLabelText("Ends"), {
    target: { value: "2099-11-06T19:00" },
  });
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(payload?.version).toBe(1));
  expect(payload?.startLocal).toBe("2099-11-06T18:00");
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
  expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  expect(
    screen.getByRole("link", { name: "Check attendance" }).getAttribute("href"),
  ).toBe(
    `/workspace/${org.id}/activities/${item.id}/sessions/${session.id}/attendance`,
  );
  expect(
    screen.getByText(
      "The session’s schedule and details are read-only once it starts.",
    ),
  ).toBeTruthy();
});
