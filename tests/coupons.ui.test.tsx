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

import { ClaimDialog } from "../src/coupons/ClaimDialog";
import MyCoupons from "../src/coupons/MyCoupons";
import Collection from "../src/coupons/Collection";
import CameraScanner from "../src/coupons/CameraScanner";
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

const cameraMock = vi.hoisted(() => ({ decode: vi.fn() }));
vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromConstraints(...args: unknown[]) {
      return cameraMock.decode(...args);
    }
  },
}));
const coupon = {
  id: "22222222-2222-4222-8222-222222222222",
  rewardName: "Drink coupon",
  cost: 20,
  status: "pending" as const,
  version: 1,
  createdAt: org.createdAt,
  fulfilledAt: null,
  cancelledAt: null,
  code: "a".repeat(64),
  personName: "Nickname A",
  canCollect: true,
};
const reward = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Drink coupon",
  description: "A drink",
  cost: 20,
  version: 1,
  inStock: true,
  eligible: true,
  createdAt: org.createdAt,
};
function mount(component: React.ReactNode, initialEntry = "/") {
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
    routeTree: root.addChildren([
      index,
      createRoute({
        getParentRoute: () => root,
        path: "/workspace/$organizationId/$section",
        component: () => component,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/workspace/$organizationId/my-coupons/$couponId",
        component: () => <p>Coupon saved</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
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
  return router;
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});

beforeEach(() => {
  cameraMock.decode.mockReset();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});
it("does not reserve points when a claim review is cancelled", async () => {
  const close = vi.fn(),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  mount(
    <ClaimDialog
      reward={reward}
      organizationId={org.id}
      userId="participant"
      onClose={close}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await userEvent
    .setup()
    .click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});
it("freezes and retries the exact claim key and reviewed version after an uncertain response", async () => {
  const writes: unknown[] = [],
    user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      writes.push(JSON.parse(init.body));
      return writes.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ item: coupon });
    }),
  );
  const router = mount(
    <ClaimDialog
      reward={reward}
      organizationId={org.id}
      userId="participant"
      onClose={() => {}}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Redeem reward" }),
  );
  await within(dialog).findByRole("alert");
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await screen.findByText("Coupon saved");
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0]).toMatchObject({ rewardId: reward.id, rewardVersion: 1 });
  expect(writes[0]).not.toHaveProperty("personId");
  expect(writes[0]).not.toHaveProperty("cost");
  expect(router.state.location.pathname).toContain(coupon.id);
});
it("shows a private QR and confirms cancellation before releasing a coupon", async () => {
  const user = userEvent.setup();
  let current = { ...coupon },
    patches = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      if (init?.method === "PATCH") {
        patches++;
        current = {
          ...current,
          status: "cancelled" as "pending",
          code: null as unknown as string,
        };
      }
      return Response.json({ item: current });
    }),
  );
  mount(
    <MyCoupons
      organization={{ ...org, role: "participant" }}
      userId="participant"
      couponId={coupon.id}
    />,
  );
  await screen.findByRole("img", { name: "Reward collection QR code" });
  expect((screen.getByLabelText("Coupon code") as HTMLInputElement).value).toBe(
    coupon.code,
  );
  await user.click(screen.getByRole("button", { name: "Cancel coupon" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(patches).toBe(0);
  await user.click(screen.getByRole("button", { name: "Cancel coupon" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel coupon",
    }),
  );
  await screen.findByText(
    "This coupon was cancelled. Its reservation has been released.",
  );
  expect(patches).toBe(1);
  expect(
    screen.queryByRole("img", { name: "Reward collection QR code" }),
  ).toBeNull();
  expect(screen.queryByDisplayValue(coupon.code)).toBeNull();
});
it("retains coupon pages on service failure and hides them after access is revoked", async () => {
  let status = 503;
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) =>
      String(input).includes("cursor=")
        ? Response.json(
            { code: status === 403 ? "forbidden" : "service" },
            { status },
          )
        : Response.json({ items: [coupon], nextCursor: "next" }),
    ),
  );
  mount(
    <MyCoupons
      organization={{ ...org, role: "participant" }}
      userId="participant"
    />,
  );
  await screen.findByText("Drink coupon");
  await user.click(await screen.findByRole("button", { name: "Load more" }));
  await screen.findByRole("button", { name: "Try again" });
  expect(screen.getByText("Drink coupon")).toBeTruthy();
  status = 403;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByText("Drink coupon")).toBeNull());
});
it("supports paste without camera, requires collection confirmation and retries the same uncertain handout", async () => {
  const user = userEvent.setup(),
    writes: unknown[] = [];
  let row = { ...coupon };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      if (init?.method === "PATCH") {
        writes.push(JSON.parse(init.body));
        if (writes.length === 1)
          return Response.json({ code: "service" }, { status: 503 });
        row = { ...row, status: "fulfilled" as "pending", canCollect: false };
      }
      return Response.json({ item: row });
    }),
  );
  mount(
    <Collection organization={org} userId="owner" />,
    `/workspace/${org.id}/collect`,
  );
  await user.type(
    await screen.findByLabelText("Coupon link or code"),
    coupon.code,
  );
  await user.click(screen.getByRole("button", { name: "Look up coupon" }));
  await screen.findByText("Nickname A");
  expect(cameraMock.decode).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm collection" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(writes).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Confirm collection" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Confirm collection",
    }),
  );
  await screen.findByText(/The response is uncertain/);
  expect(
    (screen.getByLabelText("Coupon link or code") as HTMLInputElement).disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText(
    "This reward has already been collected. The coupon cannot be used again.",
  );
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
  expect(
    screen.queryByRole("button", { name: "Confirm collection" }),
  ).toBeNull();
});
it("never offers collection for an already used scan", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        item: { ...coupon, status: "fulfilled", canCollect: false },
      }),
    ),
  );
  mount(
    <Collection organization={org} userId="owner" />,
    `/workspace/${org.id}/collect#${coupon.code}`,
  );
  await screen.findByText(
    "This reward has already been collected. The coupon cannot be used again.",
  );
  expect(
    screen.queryByRole("button", { name: "Confirm collection" }),
  ).toBeNull();
});
it("stops camera tracks on close and stops a stream that resolves after unmount", async () => {
  const stop = vi.fn(),
    controls = { stop: vi.fn() };
  let resolve!: (v: typeof controls) => void;
  let element: HTMLVideoElement;
  cameraMock.decode.mockImplementation(async (_constraints, video) => {
    element = video;
    await new Promise<typeof controls>((r) => {
      resolve = r;
    });
    video.srcObject = { getTracks: () => [{ stop }] };
    return controls;
  });
  const mounted = render(
    <CameraScanner onScan={() => {}} onClose={() => {}} />,
  );
  await waitFor(() => expect(cameraMock.decode).toHaveBeenCalledTimes(1));
  mounted.unmount();
  resolve(controls);
  await waitFor(() => expect(stop).toHaveBeenCalled());
  expect(controls.stop).toHaveBeenCalled();
  expect(element!.srcObject).toBeNull();
});
it("stops an active camera when backgrounded and provides paste guidance after denial", async () => {
  const stop = vi.fn(),
    controls = { stop: vi.fn() },
    close = vi.fn();
  cameraMock.decode.mockImplementation(async (_constraints, video) => {
    video.srcObject = { getTracks: () => [{ stop }] };
    return controls;
  });
  const mounted = render(<CameraScanner onScan={() => {}} onClose={close} />);
  await waitFor(() => expect(cameraMock.decode).toHaveBeenCalledTimes(1));
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(close).toHaveBeenCalled();
  expect(stop).toHaveBeenCalled();
  mounted.unmount();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  cameraMock.decode.mockRejectedValueOnce(new Error("Permission denied"));
  render(<CameraScanner onScan={() => {}} onClose={() => {}} />);
  await screen.findByText(/Camera scanning is unavailable/);
});
