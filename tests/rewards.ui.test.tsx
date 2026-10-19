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

import Rewards from "../src/rewards/Rewards";
import { RewardEditor } from "../src/rewards/RewardEditor";
import { RedemptionEditor } from "../src/rewards/RedemptionEditor";
import { RewardWallet } from "../src/rewards/RewardWallet";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test organization",
  slug: "test-org",
  role: "owner" as const,
  timezone: "UTC",
  createdAt: "2020-01-01T00:00:00Z",
};
const reward = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Book token",
  description: "A book of your choice",
  cost: 40,
  stock: 2,
  used: 0,
  archived: false,
  version: 1,
  createdAt: org.createdAt,
};
const person = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Member A",
  createdAt: org.createdAt,
  earned: "100",
  reserved: "0",
  spent: "0",
  available: "100",
  eligible: true,
};
const redemption = {
  id: "44444444-4444-4444-8444-444444444444",
  rewardId: reward.id,
  personId: person.id,
  personName: person.name,
  rewardName: reward.name,
  cost: 40,
  status: "pending" as const,
  version: 1,
  createdAt: org.createdAt,
  createdByName: "Organizer",
  fulfilledAt: null,
  fulfilledByName: null,
  cancelledAt: null,
  cancelledByName: null,
  cancelReason: null,
};
function mount(component: React.ReactNode) {
  const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    }),
    root = createRootRoute({ component: () => <Outlet /> }),
    index = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => component,
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
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("preserves the exact reward creation request after an uncertain save and confirms dirty discard", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      writes.push(JSON.parse(init.body));
      return writes.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ item: reward });
    }),
  );
  mount(
    <RewardEditor
      path="/api/test/rewards"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  let dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Reward name"), "Book token");
  await user.type(within(dialog).getByLabelText("Points required"), "40");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByRole("alert");
  expect(
    (within(dialog).getByLabelText("Reward name") as HTMLInputElement).disabled,
  ).toBe(true);
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0]).toMatchObject({ cost: 40, stock: null });
});
it("reviews a reservation and retries with the same key without trusting a client price", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      writes.push(JSON.parse(init.body));
      return writes.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ item: redemption });
    }),
  );
  mount(
    <RedemptionEditor
      base="/api/test/rewards"
      reward={reward}
      person={person}
      mode="reserve"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/40 points will be reserved/)).toBeTruthy();
  expect(writes).toHaveLength(0);
  await user.click(
    within(dialog).getByRole("button", { name: "Reserve reward" }),
  );
  await within(dialog).findByRole("alert");
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0]).toMatchObject({ personId: person.id, rewardVersion: 1 });
  expect(writes[0]).not.toHaveProperty("cost");
});
it("requires a reason and explicit confirmation to cancel a reservation", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      writes.push(JSON.parse(init.body));
      return Response.json({ item: { ...redemption, status: "cancelled" } });
    }),
  );
  mount(
    <RedemptionEditor
      base="/api/test/rewards"
      reward={reward}
      redemption={redemption}
      mode="cancelled"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Cancellation reason"),
    "Member changed their choice",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Cancel reservation" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(writes).toHaveLength(0);
  await user.click(
    within(dialog).getByRole("button", { name: "Cancel reservation" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel reservation",
    }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(writes[0]).toEqual({
    action: "cancelled",
    version: 1,
    reason: "Member changed their choice",
  });
});
it("preserves loaded reward pages on a service failure but hides them on authorization loss", async () => {
  const user = userEvent.setup();
  let denied = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path) =>
      String(path).includes("cursor=")
        ? Response.json(
            { code: denied ? "forbidden" : "service" },
            { status: denied ? 403 : 503 },
          )
        : Response.json({ items: [reward], nextCursor: "next" }),
    ),
  );
  mount(<Rewards organization={org} userId="owner" />);
  await screen.findByText(reward.name);
  await user.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByText(reward.name)).toBeTruthy();
  denied = true;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByText(reward.name)).toBeNull());
});
it("shows a negative spendable balance without rewriting earned points", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        item: { earned: "10", reserved: "0", spent: "70", available: "-60" },
      }),
    ),
  );
  mount(
    <RewardWallet
      organizationId={org.id}
      userId="owner"
      memberId={person.id}
    />,
  );
  await screen.findByText("-60");
  expect(screen.getByText("10")).toBeTruthy();
  expect(screen.getByText(/New reservations are blocked/)).toBeTruthy();
});
it("archives only after confirmation and keeps the reward accessible in the archived view", async () => {
  const user = userEvent.setup();
  let archived = false;
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, init) => {
      if (init?.method === "PATCH") {
        writes.push(JSON.parse(init.body));
        archived = true;
        return Response.json({
          item: { ...reward, archived: true, version: 2 },
        });
      }
      const show =
        new URL(String(path), "https://test.invalid").searchParams.get(
          "archived",
        ) === "true";
      return Response.json({
        items: show === archived ? [{ ...reward, archived }] : [],
        nextCursor: null,
      });
    }),
  );
  mount(<Rewards organization={org} userId="owner" />);
  await screen.findByText(reward.name);
  await user.click(
    screen.getByRole("button", { name: "Actions for " + reward.name }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(writes).toHaveLength(0);
  await user.click(
    screen.getByRole("button", { name: "Actions for " + reward.name }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Archive",
    }),
  );
  await waitFor(() => expect(screen.queryByText(reward.name)).toBeNull());
  await user.click(screen.getByRole("checkbox", { name: "Show archived" }));
  await screen.findByText(reward.name);
  expect(writes).toEqual([{ action: "archive", archived: true, version: 1 }]);
  expect(screen.getByRole("link", { name: "View reward" })).toBeTruthy();
});
