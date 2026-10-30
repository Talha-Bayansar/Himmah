import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
import { SchedulePage } from "../src/activities/SchedulePage";
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
const activity = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Sohbet",
  location: "Main hall",
  timezone: org.timezone,
  version: 1,
  priceMinor: 100,
  description: "",
  groups: [],
  audienceGroupIds: [],
  cancelled: false,
  nextSession: null,
  createdAt: org.createdAt,
};
const sid = "33333333-3333-4333-8333-333333333333";
const rows = [
  {
    id: sid,
    seriesId: "44444444-4444-4444-8444-444444444444",
    version: 1,
    topic: "Patience",
    name: "Sohbet",
    timezone: org.timezone,
    startsAt: "2099-03-22T17:00:00Z",
    endsAt: "2099-03-22T18:00:00Z",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    seriesId: "44444444-4444-4444-8444-444444444444",
    version: 1,
    topic: "Gratitude",
    name: "Sohbet",
    timezone: org.timezone,
    startsAt: "2099-03-29T16:00:00Z",
    endsAt: "2099-03-29T17:00:00Z",
  },
];
function mount(editing = false, role = "owner", locale = "en") {
  void setLocale(locale as "en", { reload: false });
  const root = createRootRoute({ component: () => <Outlet /> });
  const page = createRoute({
    getParentRoute: () => root,
    path: "/plan",
    validateSearch: () => ({ session: editing ? sid : undefined }),
    component: () => (
      <SchedulePage
        user="owner"
        organization={{ ...org, role: role as "owner" }}
        recordId={activity.id}
        form={editing ? "session-schedule" : "session-series"}
      />
    ),
  });
  const back = createRoute({
    getParentRoute: () => root,
    path: `/workspace/$organizationId/activities/$activityId`,
    component: () => <p>Returned to sessions</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([page, back]),
    history: createMemoryHistory({ initialEntries: ["/plan"] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
}
let posts: string[] = [];
beforeEach(() => {
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: any) => {
      if (init?.method === "POST") {
        posts.push(init.body);
        return Response.json({ count: 2, ids: [sid] });
      }
      return Response.json(
        String(input).includes("?schedule")
          ? { items: rows }
          : { item: activity },
      );
    }),
  );
});
async function dates() {
  await screen.findByLabelText("Starts");
  fireEvent.change(screen.getByLabelText("Starts"), {
    target: { value: "2099-03-22T18:00" },
  });
}
it("plans weekly sessions on a page without autofocus, reviews DST dates and returns after save", async () => {
  mount();
  await dates();
  expect(document.activeElement?.tagName).not.toBe("INPUT");
  expect(
    (screen.getByLabelText("Ends", { selector: "input" }) as HTMLInputElement)
      .value,
  ).toBe("2099-03-22T19:00");
  fireEvent.change(screen.getByLabelText("Number of sessions"), {
    target: { value: "2" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Review dates" }));
  await screen.findByRole("heading", { name: "2 sessions" });
  expect(posts).toHaveLength(0);
  expect(screen.getByText(/Mar 29, 2099/)).toBeTruthy();
  await userEvent.click(
    screen.getByRole("button", { name: "Create 2 sessions" }),
  );
  await screen.findByText("Returned to sessions");
  const body = JSON.parse(posts[0]!);
  expect(body.rule.weekdays).toEqual([0]);
  expect(body.priceMinor).toBe(100);
  expect(body.location).toBe("Main hall");
  expect(body.occurrences).toHaveLength(2);
});
it("failed save retains the exact reviewed plan and request key", async () => {
  const original = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: any) => {
      if (init?.method === "POST" && posts.length === 0) {
        posts.push(init.body);
        return Response.json({ code: "service" }, { status: 503 });
      }
      return original(input, init);
    }),
  );
  mount();
  await dates();
  fireEvent.change(screen.getByLabelText("Number of sessions"), {
    target: { value: "2" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Review dates" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Create 2 sessions" }),
  );
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Edit planning" })).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry the same save" }),
  );
  await screen.findByText("Returned to sessions");
  expect(posts).toHaveLength(2);
  expect(posts[0]).toBe(posts[1]);
});
it("future scope previews old/new dates and preserves topics; conflicts require renewed review", async () => {
  let conflict = true;
  const original = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: any) => {
      if (init?.method === "POST" && conflict) {
        posts.push(init.body);
        conflict = false;
        return Response.json({ code: "conflict" }, { status: 409 });
      }
      return original(input, init);
    }),
  );
  mount(true);
  await screen.findByLabelText("Apply to");
  await userEvent.selectOptions(screen.getByLabelText("Apply to"), "future");
  fireEvent.change(screen.getByLabelText("Starts"), {
    target: { value: "2099-03-23T19:00" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Review dates" }));
  await screen.findByRole("heading", { name: "2 sessions" });
  expect(screen.getByText("Patience")).toBeTruthy();
  expect(screen.getByText("Gratitude")).toBeTruthy();
  expect(screen.getAllByText(/Current time/)).toHaveLength(2);
  await userEvent.click(
    screen.getByRole("button", { name: "Update 2 sessions" }),
  );
  await screen.findByRole("button", { name: "Refresh and review again" });
  expect(
    screen.queryByRole("button", { name: "Retry the same save" }),
  ).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh and review again" }),
  );
  expect(
    ((await screen.findByLabelText("Starts")) as HTMLInputElement).value,
  ).toBe("2099-03-23T19:00");
  await userEvent.click(screen.getByRole("button", { name: "Review dates" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Update 2 sessions" }),
  );
  await screen.findByText("Returned to sessions");
  expect(JSON.parse(posts[0]!).key).not.toBe(JSON.parse(posts[1]!).key);
});
it("rejects daylight-saving gaps before any write and supports an inclusive end date", async () => {
  mount();
  await dates();
  fireEvent.change(screen.getByLabelText("Starts"), {
    target: { value: "2099-03-29T02:30" },
  });
  fireEvent.change(screen.getByLabelText("Number of sessions"), {
    target: { value: "2" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Review dates" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /daylight saving/,
  );
  expect(posts).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Starts"), {
    target: { value: "2099-03-22T18:00" },
  });
  await userEvent.selectOptions(
    screen.getByLabelText("Stop repeating"),
    "until",
  );
  fireEvent.change(screen.getByLabelText("Last date (inclusive)"), {
    target: { value: "2099-03-29" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Review dates" }));
  await screen.findByRole("heading", { name: "2 sessions" });
});
it("dirty cancellation confirms once", async () => {
  mount();
  await dates();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(
    screen.getByRole("button", { name: "Discard changes" }),
  );
  await screen.findByText("Returned to sessions");
  expect(posts).toHaveLength(0);
});

it("volunteer direct URLs expose no scheduling controls", async () => {
  mount(false, "volunteer");
  await screen.findByRole("alert");
  expect(screen.queryByLabelText("Starts")).toBeNull();
  expect(posts).toHaveLength(0);
});
