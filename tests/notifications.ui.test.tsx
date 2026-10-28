import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
import { Notifications } from "../src/notifications/Notifications";
import { PushSettings } from "../src/notifications/PushSettings";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
import { disablePush } from "../src/notifications/push-client";
const org = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  row = {
    id,
    kind: "staff_notice",
    href: `/workspace/${org}/activities`,
    readAt: null,
    createdAt: "2026-10-20T12:00:00Z",
  };
function mount(component: React.ReactNode) {
  const root = createRootRoute({ component: () => <Outlet /> }),
    page = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => component,
    });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
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
  return client;
}
beforeEach(() => {
  setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", class {});
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
it("keeps loaded notification pages after next-page failure, retries, and marks all read", async () => {
  let nextFails = true,
    read = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") {
        read = true;
        return Response.json({ ok: true });
      }
      if (path.endsWith("/unread"))
        return Response.json({ count: read ? 0 : 2 });
      if (path.includes("cursor=")) {
        if (nextFails) {
          nextFails = false;
          return Response.json({ code: "service" }, { status: 503 });
        }
        return Response.json({
          items: [
            {
              ...row,
              id: "33333333-3333-4333-8333-333333333333",
              kind: "staff_notice",
              readAt: read ? row.createdAt : null,
            },
          ],
          nextCursor: null,
        });
      }
      return Response.json({
        items: [{ ...row, readAt: read ? row.createdAt : null }],
        nextCursor: "next",
      });
    }),
  );
  mount(<Notifications userId="staff" organizationId={org} />);
  expect((await screen.findAllByText("View update"))[0]).toBeTruthy();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect((await screen.findAllByText("View update"))[0]).toBeTruthy();
  await user.click(await screen.findByRole("button", { name: "Try again" }));
  expect((await screen.findAllByText("View update"))[0]).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Mark all as read" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Mark all as read" }),
    ).toHaveProperty("disabled", true),
  );
  expect(read).toBe(true);
});
it("hides cached notification content immediately after access is revoked", async () => {
  let denied = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      denied
        ? Response.json({ code: "not_found" }, { status: 404 })
        : String(input).endsWith("/unread")
          ? Response.json({ count: 1 })
          : Response.json({ items: [row], nextCursor: null }),
    ),
  );
  const client = mount(<Notifications userId="staff" organizationId={org} />);
  (await screen.findAllByText("View update"))[0];
  denied = true;
  await client.invalidateQueries({ queryKey: ["notifications", "staff", org] });
  await waitFor(() => expect(screen.queryByText("View update")).toBeNull());
});
it("requests browser permission only after explicit enable, preserves errors and allows retry", async () => {
  let permission: NotificationPermission = "default";
  const requestPermission = vi.fn(async () => {
    permission = "granted";
    return permission;
  });
  vi.stubGlobal("Notification", {
    get permission() {
      return permission;
    },
    requestPermission,
  });
  const subscription = {
    endpoint: "https://fcm.googleapis.com/test",
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/test", keys: {} }),
    unsubscribe: vi.fn(async () => true),
  };
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => null),
      subscribe: vi.fn(async () => subscription),
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => registration),
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  });
  let failed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? failed
          ? Response.json({ code: "service" }, { status: 503 })
          : Response.json({ ok: true })
        : Response.json({ publicKey: "BAAA" }),
    ),
  );
  mount(<PushSettings userId="staff" />);
  const enable = await screen.findByRole("button", {
    name: "Enable on this device",
  });
  expect(requestPermission).not.toHaveBeenCalled();
  await userEvent.click(enable);
  expect(
    await screen.findByText(
      "Push notifications could not be updated. Check your connection and try again.",
    ),
  ).toBeTruthy();
  expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  failed = false;
  await userEvent.click(enable);
  await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(2));
});
it("requires confirmation before disabling this device or all devices", async () => {
  vi.stubGlobal("Notification", {
    permission: "granted",
    requestPermission: vi.fn(),
  });
  const subscription = {
    endpoint: "https://fcm.googleapis.com/test",
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/test", keys: {} }),
    unsubscribe: vi.fn(async () => true),
  };
  const registration = {
    pushManager: { getSubscription: vi.fn(async () => subscription) },
    getNotifications: vi.fn(async () => []),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: vi.fn(async () => registration) },
  });
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "DELETE"
        ? Response.json({ ok: true })
        : init?.method === "POST"
          ? Response.json({ enabled: true })
          : Response.json({ publicKey: "BAAA" }),
  );
  vi.stubGlobal("fetch", fetcher);
  mount(<PushSettings userId="staff" />);
  await screen.findByText("Push notifications are enabled on this device.");
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Disable on this device" }),
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    fetcher.mock.calls.filter((c) => c[1]?.method === "DELETE"),
  ).toHaveLength(0);
  await user.click(
    screen.getByRole("button", { name: "Disable on all devices" }),
  );
  const dialog = screen.getByRole("alertdialog");
  expect(dialog).toBeTruthy();
  const buttons = [...dialog.querySelectorAll("button")];
  await user.click(
    buttons.find((b) => b.textContent === "Disable on all devices")!,
  );
  await waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalled());
  expect(
    fetcher.mock.calls.some(
      (c) => String(c[0]).endsWith("/all") && c[1]?.method === "DELETE",
    ),
  ).toBe(true);
});
it("sign-out device cleanup removes the server subscription before local unsubscribe", async () => {
  const calls: string[] = [];
  const subscription = {
    endpoint: "https://fcm.googleapis.com/test",
    unsubscribe: vi.fn(async () => {
      calls.push("browser");
      return true;
    }),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => ({
        pushManager: { getSubscription: async () => subscription },
        getNotifications: async () => [],
      })),
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls.push("server");
      return Response.json({ ok: true });
    }),
  );
  await disablePush();
  expect(calls).toEqual(["server", "browser"]);
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ code: "service" }, { status: 503 })),
  );
  await expect(disablePush()).rejects.toThrow();
  expect(calls).toEqual([]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ code: "sign_in" }, { status: 401 })),
  );
  await disablePush();
  expect(calls).toEqual(["browser"]);
});

it("activates a waiting push-capable service worker after explicit opt-in without reloading", async () => {
  const { enablePush } = await import("../src/notifications/push-client");
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: vi.fn(async () => "granted"),
  });
  const worker = new EventTarget() as EventTarget & {
    state: string;
    postMessage: ReturnType<typeof vi.fn>;
  };
  worker.state = "installed";
  worker.postMessage = vi.fn(() => {
    worker.state = "activated";
    worker.dispatchEvent(new Event("statechange"));
  });
  const subscription = {
    endpoint: "https://fcm.googleapis.com/test",
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/test", keys: {} }),
  };
  const registration = {
    installing: null,
    waiting: worker,
    pushManager: { getSubscription: async () => subscription },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: async () => registration,
      ready: Promise.resolve(registration),
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true })),
  );
  await enablePush("BAAA", "en");
  expect(worker.postMessage).toHaveBeenCalledWith({
    type: "himmah-enable-push",
  });
});
