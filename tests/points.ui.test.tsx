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
import { PointsEditor } from "../src/points/PointsEditor";
import MemberPage from "../src/points/MemberPage";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
import type { PointsEntry } from "../src/points/contracts";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test organization",
  slug: "test-org",
  role: "owner" as const,
  timezone: "UTC",
  createdAt: "2020-01-01T12:00:00Z",
};
const member = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Member One",
  createdAt: "2020-01-01T12:00:00Z",
};
const entry: PointsEntry = {
  id: "33333333-3333-4333-8333-333333333333",
  personId: member.id,
  amount: 10,
  currentAmount: 10,
  version: 1,
  reason: "Helping prepare the room",
  occurredAt: "2020-01-01T12:00:00Z",
  createdAt: "2020-01-01T12:00:00Z",
  originalId: null,
  originalReason: null,
  actorName: "Organizer",
  activityId: null,
  sessionId: null,
  activityName: null,
  sessionName: null,
};
function mount(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const root = createRootRoute({ component: () => <Outlet /> }),
    route = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => component,
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
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("reviews an award, cancels without posting, and retries an uncertain response with the exact same request", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      bodies.push(JSON.parse(init.body));
      return bodies.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({
            items: [
              { personId: member.id, name: member.name, outcome: "saved" },
            ],
          });
    }),
  );
  mount(
    <PointsEditor
      organization={org}
      userId="owner"
      member={member}
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Points per member"), "12");
  await user.type(
    within(dialog).getByLabelText("Reason (staff only)"),
    "Helping prepare the room",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Award points" }),
  );
  const confirm = await screen.findByRole("alertdialog");
  expect(within(confirm).getByText(/12 points each to 1 members/)).toBeTruthy();
  await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(bodies).toHaveLength(0);
  await user.click(
    within(dialog).getByRole("button", { name: "Award points" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Award points",
    }),
  );
  await within(dialog).findByRole("alert");
  expect(
    within(dialog).getByLabelText("Points per member").hasAttribute("disabled"),
  ).toBe(true);
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
});
it("bulk selection survives pagination and delivers explicit per-member save outcomes", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    second = {
      ...member,
      id: "44444444-4444-4444-8444-444444444444",
      name: "Member Two",
    };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, init) => {
      if (init?.method === "POST")
        return Response.json({
          items: [
            { personId: member.id, name: member.name, outcome: "saved" },
            { personId: second.id, name: second.name, outcome: "ineligible" },
          ],
        });
      return Response.json(
        String(path).includes("cursor=next")
          ? { items: [second], nextCursor: null }
          : { items: [member], nextCursor: "next" },
      );
    }),
  );
  mount(
    <PointsEditor
      organization={org}
      userId="owner"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    await within(dialog).findByRole("checkbox", { name: member.name }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Load more" }));
  await user.click(
    await within(dialog).findByRole("checkbox", { name: second.name }),
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Continue (2)" }),
  );
  await user.type(within(dialog).getByLabelText("Points per member"), "8");
  await user.type(
    within(dialog).getByLabelText("Reason (staff only)"),
    "Community service",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Award points" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Award points",
    }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(
    saved.mock.calls[0]![0].items.map((x: { outcome: string }) => x.outcome),
  ).toEqual(["saved", "ineligible"]);
});
it("corrections require confirmation and retain the original award ID and expected version", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      bodies.push(JSON.parse(init.body));
      return Response.json({
        items: [{ personId: member.id, name: member.name, outcome: "saved" }],
      });
    }),
  );
  mount(
    <PointsEditor
      organization={org}
      userId="owner"
      member={member}
      correction={entry}
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  const amount = within(dialog).getByLabelText("Corrected award value");
  await user.clear(amount);
  await user.type(amount, "0");
  await user.type(
    within(dialog).getByLabelText("Reason (staff only)"),
    "Duplicate award",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Correct points" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(bodies).toHaveLength(0);
  await user.click(
    within(dialog).getByRole("button", { name: "Correct points" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Correct points",
    }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(bodies[0]).toMatchObject({
    kind: "correct",
    originalId: entry.id,
    version: 1,
    amount: 0,
  });
});
it("loads member history independently and preserves entries after a next-page error", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path) => {
      if (String(path).includes("cursor=next"))
        return Response.json({ code: "service" }, { status: 503 });
      if (String(path).includes("/points"))
        return Response.json({ items: [entry], nextCursor: "next" });
      return Response.json({
        item: { ...member, balance: "10", archived: false, version: 1 },
      });
    }),
  );
  mount(<MemberPage organization={org} userId="owner" memberId={member.id} />);
  await screen.findByRole("heading", { name: member.name });
  await screen.findByText(entry.reason);
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByText(entry.reason)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "Members" })).toHaveLength(1);
});
