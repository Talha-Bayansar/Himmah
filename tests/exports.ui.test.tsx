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
import DataExports from "../src/exports/DataExports";
import { exportSearch } from "../src/exports/contracts";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
const org = "11111111-1111-4111-8111-111111111111",
  group = "22222222-2222-4222-8222-222222222222";
const organization = {
  id: org,
  name: "Synthetic Community",
  slug: "exports",
  role: "owner" as const,
  timezone: "Europe/Brussels",
  createdAt: "2026-11-04T00:00:00Z",
};
function mount(search = "", role = "owner") {
  const root = createRootRoute({ component: () => <Outlet /> }),
    page = createRoute({
      getParentRoute: () => root,
      path: "/workspace/$organizationId/exports",
      validateSearch: exportSearch,
      component: () => (
        <DataExports
          organization={{ ...organization, role: role as "owner" }}
          userId="owner"
        />
      ),
    }),
    back = createRoute({
      getParentRoute: () => root,
      path: "/workspace/$organizationId/$section",
      component: () => <p>Back destination</p>,
    });
  const router = createRouter({
    routeTree: root.addChildren([page, back]),
    history: createMemoryHistory({
      initialEntries: [`/workspace/${org}/exports${search}`],
    }),
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return router;
}
function fileResponse(rows = 1) {
  return new Response('\ufeff"Name"\r\n"Synthetic"', {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="himmah-contacts-active-en.csv"',
      "x-himmah-export-rows": String(rows),
      "x-himmah-generated-at": "2026-11-04T12:00:00.000Z",
    },
  });
}
function backend(
  download: (
    url: string,
    init?: RequestInit,
  ) => Response | Promise<Response> = () => fileResponse(),
) {
  const fetcher = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/exports/context"))
      return Response.json({
        organizationName: organization.name,
        timezone: organization.timezone,
        activityName: null,
        groupName: url.includes(group) ? "Historical group" : null,
        sessionName: null,
      });
    if (url.includes("/insights/options"))
      return Response.json({
        items: [
          {
            id: group,
            name: "Historical group",
            archived: false,
            createdAt: organization.createdAt,
          },
        ],
        nextCursor: null,
      });
    return download(url, init);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
beforeEach(() => {
  setLocale("en", { reload: false });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("IntersectionObserver", undefined);
  URL.createObjectURL = vi.fn().mockReturnValue("blob:synthetic");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
it("opens a bookmarkable report without autofocus or automatic file generation, preserving URL filters", async () => {
  const calls = backend();
  const router = mount("?kind=contacts&q=Alex&state=archived&locale=tr");
  const download = await screen.findByRole("button", { name: "Download CSV" });
  await waitFor(() => expect(download.matches(":disabled")).toBe(false));
  expect(document.activeElement).not.toBe(screen.getByLabelText("Report"));
  expect(
    (screen.getByLabelText("File language") as HTMLSelectElement).value,
  ).toBe("tr");
  expect(
    (screen.getByLabelText("Contacts to include") as HTMLSelectElement).value,
  ).toBe("archived");
  expect(
    (screen.getByLabelText("Search contacts") as HTMLInputElement).value,
  ).toBe("Alex");
  expect(calls.mock.calls.every(([u]) => String(u).includes("/context"))).toBe(
    true,
  );
  await userEvent.setup().click(download);
  await screen.findByRole("status");
  const url = calls.mock.calls.find(
    ([u]) => !String(u).includes("/context"),
  )![0];
  expect(String(url)).toContain("state=archived");
  expect(String(url)).toContain("locale=tr");
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(router.state.location.search.q).toBe("Alex");
});
it("keeps invalid date inputs editable and never downloads an invalid range", async () => {
  const calls = backend();
  mount("?kind=attendance&from=2026-11-30&to=2026-11-01");
  await screen.findByText(/Choose valid filters/);
  expect(screen.getByLabelText("From")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Download CSV" }).matches(":disabled"),
  ).toBe(true);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("From"));
  await user.type(screen.getByLabelText("From"), "2026-11-01");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Download CSV" }).matches(":disabled"),
    ).toBe(false),
  );
  expect(calls.mock.calls.every(([u]) => String(u).includes("/context"))).toBe(
    true,
  );
});
it("retains filters on a size failure and retries a fresh read without creating a file early", async () => {
  let tries = 0;
  const calls = backend(() =>
    ++tries === 1
      ? Response.json({ code: "export_limit" }, { status: 413 })
      : fileResponse(2),
  );
  mount("?kind=balances&from=2026-11-01&to=2026-11-04");
  const user = userEvent.setup();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Download CSV" }).matches(":disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Download CSV" }));
  await screen.findByText(/This export is too large/);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Report") as HTMLSelectElement).value).toBe(
    "balances",
  );
  await user.click(screen.getByRole("button", { name: "Download CSV" }));
  await screen.findByText(/CSV prepared: 2 rows/);
  expect(tries).toBe(2);
  expect(
    calls.mock.calls.filter(([u]) => !String(u).includes("/context")),
  ).toHaveLength(2);
});
it("hides private context after permission loss and does not create a blob", async () => {
  backend(() => Response.json({ code: "forbidden" }, { status: 403 }));
  mount();
  const user = userEvent.setup();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Download CSV" }).matches(":disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Download CSV" }));
  await screen.findByText(/do not have access/i);
  expect(screen.queryByLabelText("Report")).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("abort and scope cleanup prevent a late response from starting a download after navigation", async () => {
  let finish: (value: Response) => void = () => {};
  let signal: AbortSignal | undefined;
  backend((_url, init) => {
    signal = init?.signal as AbortSignal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const router = mount();
  const user = userEvent.setup();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Download CSV" }).matches(":disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Download CSV" }));
  await waitFor(() => expect(signal).toBeTruthy());
  await router.navigate({
    to: "/workspace/$organizationId/$section",
    params: { organizationId: org, section: "manage" },
  });
  finish(fileResponse());
  await screen.findByText("Back destination");
  expect(signal!.aborted).toBe(true);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("volunteers get neither export controls nor metadata requests", async () => {
  const calls = backend();
  mount("", "volunteer");
  await screen.findByText(/do not have access/i);
  expect(calls).not.toHaveBeenCalled();
});
it("a filter/history change aborts a pending file and prevents stale download creation", async () => {
  let finish: (value: Response) => void = () => {},
    signal: AbortSignal | undefined;
  backend((_url, init) => {
    signal = init?.signal as AbortSignal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const router = mount();
  const user = userEvent.setup();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Download CSV" }).matches(":disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Download CSV" }));
  await router.navigate({
    to: "/workspace/$organizationId/exports",
    params: { organizationId: org },
    search: { kind: "balances", from: "2026-11-01", to: "2026-11-04" },
  });
  finish(fileResponse());
  await waitFor(() =>
    expect((screen.getByLabelText("Report") as HTMLSelectElement).value).toBe(
      "balances",
    ),
  );
  expect(signal!.aborted).toBe(true);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("permission loss in the shared picker clears export context and closes the sheet", async () => {
  const original = backend();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) =>
      String(input).includes("/insights/options")
        ? Response.json({ code: "forbidden" }, { status: 403 })
        : original(input, init),
    ),
  );
  mount();
  const user = userEvent.setup();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Download CSV" }).matches(":disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Group" }));
  await screen.findByText(/do not have access/i);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByLabelText("Report")).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("reset recovers an invalid bookmarked range without silently changing the report", async () => {
  backend();
  mount("?kind=attendance&from=2026-11-30&to=2026-11-01");
  await screen.findByText(/Choose valid filters/);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Reset filters" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Download CSV" }).matches(":disabled"),
    ).toBe(false),
  );
  expect((screen.getByLabelText("Report") as HTMLSelectElement).value).toBe(
    "attendance",
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
