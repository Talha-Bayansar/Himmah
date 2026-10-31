import { beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  within,
  waitFor,
  fireEvent,
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
import { Workflow } from "../src/organization/WorkflowPage";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Community",
  slug: "community",
  timezone: "Europe/Brussels",
  role: "owner" as const,
  createdAt: "2026-10-30T10:00:00Z",
};
const activity = "22222222-2222-4222-8222-222222222222",
  sid = "33333333-3333-4333-8333-333333333333";
const items = [
  {
    id: sid,
    name: "Sohbet",
    topic: "Patience",
    timezone: org.timezone,
    startsAt: "2099-01-05T18:00:00Z",
    endsAt: "2099-01-05T19:00:00Z",
    registrations: 2,
    attendance: 0,
    charges: 1,
    collectedMinor: 200,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Sohbet",
    topic: "Gratitude",
    timezone: org.timezone,
    startsAt: "2099-01-12T18:00:00Z",
    endsAt: "2099-01-12T19:00:00Z",
    registrations: 1,
    attendance: 0,
    charges: 0,
    collectedMinor: 0,
  },
];
let posts: string[] = [],
  failure = "",
  standalone = false,
  deny = false,
  gets = 0;
function backend() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: any) => {
      if (deny) return Response.json({ code: "forbidden" }, { status: 403 });
      if (init?.method === "POST") {
        posts.push(init.body);
        if (failure) {
          const code = failure;
          failure = "";
          return Response.json(
            { code },
            { status: code === "conflict" ? 409 : 503 },
          );
        }
        return Response.json({
          count: 2,
          ids: items.map((i) => i.id),
          reviewRequired: true,
        });
      }
      gets++;
      const future = String(input).includes("scope=future");
      return Response.json({
        snapshot: (gets > 2 ? "b" : "a").repeat(32),
        seriesId: standalone ? null : "55555555-5555-4555-8555-555555555555",
        items: future ? items : items.slice(0, 1),
      });
    }),
  );
}
function mount(
  returnTo = `/workspace/${org.id}/activities/${activity}`,
  role = "owner",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const form = createRoute({
    getParentRoute: () => root,
    path: "/form",
    validateSearch: () => ({ session: sid, returnTo }),
    component: () => (
      <Workflow
        user="owner"
        organization={{ ...org, role: role as "owner" }}
        recordId={activity}
        form="session-cancel"
      />
    ),
  });
  const back = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/activities/$activityId",
    component: () => <p>Back to sessions</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([form, back]),
    history: createMemoryHistory({ initialEntries: ["/form"] }),
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
  setLocale("en", { reload: false });
  posts = [];
  gets = 0;
  failure = "";
  standalone = false;
  deny = false;
});
async function prepare() {
  await screen.findByText("Patience");
  await userEvent.selectOptions(screen.getByLabelText("Apply to"), "future");
  await screen.findByText("Gratitude");
  await userEvent.type(
    screen.getByLabelText("Cancellation reason"),
    "Building unavailable",
  );
}
it("shows reviewed dates and money, confirms once and returns without changing attendance/payments", async () => {
  backend();
  mount();
  await prepare();
  expect(document.activeElement).not.toBe(
    screen.getByRole("heading", { name: "Cancel sessions" }),
  );
  expect(
    screen.getByText(/Review charges and received cash/),
  ).toBeTruthy();
  expect(posts).toHaveLength(0);
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel 2 sessions" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog.textContent).toContain("Confirmed registrations: 3");
  expect(posts).toHaveLength(0);
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Cancel 2 sessions" }),
  );
  await screen.findByText("Back to sessions");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0]!).scope).toBe("future");
  expect(JSON.parse(posts[0]!).reason).toBe("Building unavailable");
});
it("declining destructive confirmation leaves all sessions intact", async () => {
  backend();
  mount();
  await prepare();
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel 2 sessions" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(posts).toHaveLength(0);
  expect(
    (screen.getByLabelText("Cancellation reason") as HTMLTextAreaElement).value,
  ).toBe("Building unavailable");
});
it("lost response locks the reviewed payload and retries it without a second confirmation", async () => {
  failure = "service";
  backend();
  mount();
  await prepare();
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel 2 sessions" }),
  );
  await userEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel 2 sessions",
    }),
  );
  await screen.findByRole("alert");
  expect(
    (screen.getByLabelText("Cancellation reason") as HTMLTextAreaElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByLabelText("Apply to") as HTMLSelectElement).disabled,
  ).toBe(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Retry cancellation" }),
  );
  await screen.findByText("Back to sessions");
  expect(posts).toHaveLength(2);
  expect(posts[0]).toBe(posts[1]);
});
it("stale review requires refreshing and a new confirmation while preserving the reason", async () => {
  failure = "conflict";
  backend();
  mount();
  await prepare();
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel 2 sessions" }),
  );
  await userEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel 2 sessions",
    }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Refresh and review again" }),
  );
  await screen.findByText("Gratitude");
  expect(
    (screen.getByLabelText("Cancellation reason") as HTMLTextAreaElement).value,
  ).toBe("Building unavailable");
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel 2 sessions" }),
  );
  await userEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel 2 sessions",
    }),
  );
  await screen.findByText("Back to sessions");
  expect(JSON.parse(posts[0]!).key).not.toBe(JSON.parse(posts[1]!).key);
  expect(JSON.parse(posts[0]!).snapshot).not.toBe(
    JSON.parse(posts[1]!).snapshot,
  );
});
it("standalone cancellation has no series scope, rejects an external return and guards a draft once", async () => {
  standalone = true;
  backend();
  mount("https://outside.example");
  await screen.findByText("Patience");
  expect(screen.queryByLabelText("Apply to")).toBeNull();
  expect(document.activeElement?.tagName).not.toBe("TEXTAREA");
  await userEvent.type(screen.getByLabelText("Cancellation reason"), "Reason");
  await userEvent.click(screen.getByRole("button", { name: "Keep sessions" }));
  await userEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Discard changes",
    }),
  );
  await screen.findByText("Back to sessions");
  expect(posts).toHaveLength(0);
});
it("permission loss removes reviewed private data", async () => {
  backend();
  const client = mount();
  await screen.findByText("Patience");
  deny = true;
  await userEvent.selectOptions(screen.getByLabelText("Apply to"), "future");
  await screen.findByRole("alert");
  await waitFor(() => expect(screen.queryByText("Patience")).toBeNull());
  expect(
    client
      .getQueriesData({ queryKey: ["organization", "owner", org.id] })
      .every(([, data]) => data === undefined),
  ).toBe(true);
});
