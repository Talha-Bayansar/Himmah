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
import CashPage from "../src/cash/CashPage";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
import type { CashView } from "../src/cash/contracts";
const org = "11111111-1111-4111-8111-111111111111",
  activity = "22222222-2222-4222-8222-222222222222",
  session = "33333333-3333-4333-8333-333333333333",
  chargeA = "44444444-4444-4444-8444-444444444444",
  chargeB = "55555555-5555-4555-8555-555555555555";
const summary = {
  name: "Paid session",
  timezone: "UTC",
  canManage: true,
  canRecord: true,
  owedMinor: 2000,
  paidMinor: 500,
  outstandingMinor: 1500,
  collectedMinor: 500,
  unallocatedMinor: 0,
};
const a = {
    id: chargeA,
    name: "Sibling A",
    amountMinor: 1000,
    paidMinor: 0,
    outstandingMinor: 1000,
    version: 1,
    status: "unpaid",
    reviewRequired: false,
    createdAt: "2026-10-29T10:00:00Z",
  },
  b = {
    ...a,
    id: chargeB,
    name: "Sibling B",
    paidMinor: 500,
    outstandingMinor: 500,
    version: 2,
    status: "partial",
  };
function backend(
  custom?: (u: URL, init?: RequestInit) => Response | undefined,
) {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input), "https://himmah.test"),
        response = custom?.(u, init);
      if (response) return response;
      const organization = {
        id: org,
        name: "Community",
        slug: "community",
        timezone: "UTC",
        role: "owner",
        createdAt: a.createdAt,
      };
      if (u.pathname === "/api/account")
        return Response.json({ user: { id: "owner", emailVerified: true } });
      if (u.pathname === "/api/organizations")
        return Response.json({
          organizations: [organization],
          nextCursor: null,
        });
      if (u.pathname === `/api/organizations/${org}`)
        return Response.json({ organization });
      if (u.pathname.endsWith("/notifications/unread"))
        return Response.json({ count: 0 });
      if (init?.method === "POST") return Response.json({ id: chargeA });
      if (u.pathname.endsWith("/charges/" + chargeA))
        return Response.json({ item: a, summary });
      if (u.pathname.endsWith("/charges/" + chargeB))
        return Response.json({ item: b, summary });
      return Response.json({ items: [a, b], summary, nextCursor: null });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mount(record = false) {
  const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
    root = createRootRoute({ component: () => <Outlet /> });
  const cash = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/cash",
    validateSearch: (s: Record<string, unknown>) => ({
      q: String(s.q ?? ""),
      view: String(s.view ?? "all") as CashView,
    }),
    component: () => {
      const f = cash.useSearch(),
        nav = cash.useNavigate();
      return (
        <CashPage
          {...cash.useParams()}
          filters={f}
          onFiltersChange={(search) => void nav({ search, replace: true })}
        />
      );
    },
  });
  const form = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/record-cash",
    component: () => (
      <CashPage
        {...form.useParams()}
        record
        chargeId={chargeA}
        filters={{ q: "", view: "all" }}
        onFiltersChange={() => {}}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([cash, form]),
    history: createMemoryHistory({
      initialEntries: [
        `/workspace/${org}/activities/${activity}/sessions/${session}/${record ? "record-cash" : "cash"}`,
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
  return { router, client };
}
beforeEach(() => {
  setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
it("cash list shows balances with URL-backed status and history filters", async () => {
  backend();
  const { router } = mount();
  await screen.findByText("Sibling A");
  expect(screen.getByText("Sibling B")).toBeTruthy();
  expect(screen.getAllByText(/Partially paid/).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText("Show"), {
    target: { value: "paid" },
  });
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({ view: "paid" }),
  );
});
it("multi-contact cash uses a page, confirms the allocation, and returns after saving", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend((u, init) => {
    if (init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({ id: chargeA });
    }
  });
  const { router } = mount(true),
    user = userEvent.setup();
  await screen.findByLabelText("Cash received (EUR)");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement?.matches("input")).toBe(false);
  await user.click(screen.getByRole("checkbox", { name: /Sibling B/ }));
  await user.clear(screen.getByLabelText("Cash received (EUR)"));
  await user.type(screen.getByLabelText("Cash received (EUR)"), "15");
  await user.click(screen.getByRole("button", { name: "Record cash" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(submitted).toBeUndefined();
  await user.click(within(dialog).getByRole("button", { name: "Record cash" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toMatch(/\/cash$/),
  );
  expect(submitted).toMatchObject({
    action: "record",
    amountMinor: 1500,
    allocations: [
      { chargeId: chargeA, version: 1, amountMinor: 1000 },
      { chargeId: chargeB, version: 2, amountMinor: 500 },
    ],
  });
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("uncertain cash saves freeze the exact request and retry without duplicate confirmation", async () => {
  const writes: Record<string, unknown>[] = [];
  backend((u, init) => {
    if (init?.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      return writes.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ id: chargeA });
    }
  });
  mount(true);
  const user = userEvent.setup();
  await screen.findByLabelText("Cash received (EUR)");
  await user.click(screen.getByRole("button", { name: "Record cash" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Record cash" }));
  await screen.findByText(
    "The result is uncertain. Retry the saved request before recording this cash again.",
  );
  expect(
    (screen.getByLabelText("Cash received (EUR)") as HTMLInputElement).disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(writes[0]);
});
it("Back guards the draft once and cancelling the prompt preserves the allocation", async () => {
  backend();
  mount(true);
  const user = userEvent.setup();
  await screen.findByLabelText("Cash received (EUR)");
  await user.click(screen.getByRole("button", { name: "Back" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(
    (screen.getByLabelText("Cash received (EUR)") as HTMLInputElement).value,
  ).toBe("10.00");
});
it("current scope loss hides an opened cash draft and clears private cash caches", async () => {
  let revoked = false;
  backend((u) =>
    revoked && u.pathname.endsWith("/cash")
      ? Response.json({ code: "forbidden" }, { status: 403 })
      : undefined,
  );
  const { client } = mount(true);
  await screen.findByLabelText("Cash received (EUR)");
  revoked = true;
  await client.invalidateQueries({
    queryKey: ["organization", "owner", org, "activities"],
  });
  await waitFor(() =>
    expect(screen.queryByLabelText("Cash received (EUR)")).toBeNull(),
  );
  expect(
    client.getQueriesData({
      queryKey: ["organization", "owner", org, "activities"],
    }),
  ).toHaveLength(0);
});
it("collection-only staff cannot view receipt history or organization cash totals", async () => {
  backend((u) =>
    u.pathname.endsWith("/cash")
      ? Response.json({
          items: [a],
          summary: {
            ...summary,
            canManage: false,
            collectedMinor: null,
            unallocatedMinor: null,
          },
          nextCursor: null,
        })
      : undefined,
  );
  mount();
  await screen.findByText("Sibling A");
  expect(screen.queryByRole("option", { name: "Receipt history" })).toBeNull();
  expect(screen.queryByText("Cash collected")).toBeNull();
  expect(screen.queryByText("Sibling B")).toBeNull();
});
it("a balance conflict keeps the draft, refreshes selected versions and requires reviewing the allocation", async () => {
  const writes: Record<string, unknown>[] = [];
  let changed = false;
  backend((u, init) => {
    if (init?.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      changed = true;
      return writes.length === 1
        ? Response.json({ code: "conflict" }, { status: 409 })
        : Response.json({ id: chargeA });
    }
    if (changed && u.pathname.endsWith("/charges/" + chargeA))
      return Response.json({
        item: {
          ...a,
          paidMinor: 500,
          outstandingMinor: 500,
          version: 2,
          status: "partial",
        },
        summary,
      });
  });
  mount(true);
  const user = userEvent.setup();
  await screen.findByLabelText("Cash received (EUR)");
  await user.click(screen.getByRole("button", { name: "Record cash" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Record cash",
    }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Refresh selected balances" }),
  );
  const allocation = await screen.findByLabelText(
    /Sibling A.*Outstanding:.*5.00/,
  );
  expect((allocation as HTMLInputElement).value).toBe("10.00");
  await user.clear(allocation);
  await user.type(allocation, "5");
  await user.clear(screen.getByLabelText("Cash received (EUR)"));
  await user.type(screen.getByLabelText("Cash received (EUR)"), "5");
  await user.click(screen.getByRole("button", { name: "Record cash" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Record cash",
    }),
  );
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toMatchObject({
    amountMinor: 500,
    allocations: [{ chargeId: chargeA, version: 2, amountMinor: 500 }],
  });
  expect(writes[0]!.key).not.toBe(writes[1]!.key);
});
it("saving cash for an uncharged participant creates the fee and payment in one explicit action", async () => {
  let submitted: Record<string, unknown> | undefined;
  const offer = {
    ...a,
    id: chargeA,
    personId: chargeA,
    contactVersion: 1,
    sessionVersion: 4,
    status: "not_charged",
    version: 0,
    canCharge: true,
  };
  const fetcher = backend((u, init) => {
    if (init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({ id: chargeB });
    }
    if (u.pathname.endsWith("/charges/" + chargeA))
      return Response.json({ item: offer, summary });
  });
  mount(true);
  const user = userEvent.setup();
  await screen.findByLabelText("Cash received (EUR)");
  expect(screen.getByText(/Saving adds the/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Record cash" }));
  const confirmation = await screen.findByRole("alertdialog");
  expect(within(confirmation).getByText(/Also creates/)).toBeTruthy();
  expect(submitted).toBeUndefined();
  await user.click(
    within(confirmation).getByRole("button", { name: "Record cash" }),
  );
  await waitFor(() => expect(submitted).toBeTruthy());
  expect(submitted).toMatchObject({
    action: "record",
    amountMinor: 1000,
    allocations: [
      {
        personId: chargeA,
        contactVersion: 1,
        sessionVersion: 4,
        version: 0,
        amountMinor: 1000,
      },
    ],
  });
  expect(
    fetcher.mock.calls.some(([input]) =>
      String(input).includes("/registrations"),
    ),
  ).toBe(false);
});

it("records one contact's full cash payment in a sheet with a single reviewed save", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend((_url, init) => {
    if (init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({ id: chargeA });
    }
  });
  const { router } = mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Record payment for Sibling A" }),
  );
  const sheet = await screen.findByRole("dialog");
  const input = within(sheet).getByLabelText(
    "Cash received (EUR)",
  ) as HTMLInputElement;
  expect(input.value).toBe("10.00");
  expect(document.activeElement).not.toBe(input);
  expect(within(sheet).queryByLabelText("Payer label (optional)")).toBeNull();
  await user.click(within(sheet).getByRole("button", { name: /Record.*cash/ }));
  await waitFor(() =>
    expect(submitted).toMatchObject({
      action: "record",
      amountMinor: 1000,
      payerLabel: "",
      allocations: [{ chargeId: chargeA, version: 1, amountMinor: 1000 }],
    }),
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(router.state.location.pathname).toContain("/cash");
  expect(await screen.findByText(/recorded for Sibling A/)).toBeTruthy();
});
it("quick cash supports partial payments and blocks excess allocations", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend((_url, init) => {
    if (init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({ id: chargeA });
    }
  });
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Record payment for Sibling A" }),
  );
  const sheet = await screen.findByRole("dialog"),
    input = within(sheet).getByLabelText("Cash received (EUR)");
  await user.clear(input);
  await user.type(input, "11");
  await user.click(within(sheet).getByRole("button", { name: /Record.*cash/ }));
  expect(submitted).toBeUndefined();
  expect(await within(sheet).findByRole("alert")).toBeTruthy();
  await user.clear(input);
  await user.type(input, "4,50");
  expect(
    within(sheet).getByText(/Remaining after payment:.*5.50/),
  ).toBeTruthy();
  await user.click(within(sheet).getByRole("button", { name: /Record.*cash/ }));
  await waitFor(() =>
    expect(submitted).toMatchObject({
      amountMinor: 450,
      allocations: [{ chargeId: chargeA, version: 1, amountMinor: 450 }],
    }),
  );
});
it("quick cash retries the identical payload after an uncertain response", async () => {
  const attempts: Record<string, unknown>[] = [];
  backend((_url, init) => {
    if (init?.method === "POST") {
      attempts.push(JSON.parse(String(init.body)));
      return attempts.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ id: chargeA });
    }
  });
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Record payment for Sibling A" }),
  );
  const sheet = await screen.findByRole("dialog");
  await user.click(within(sheet).getByRole("button", { name: /Record.*cash/ }));
  expect(
    (within(sheet).getByLabelText("Cash received (EUR)") as HTMLInputElement)
      .disabled,
  ).toBe(true);
  await user.click(
    await within(sheet).findByRole("button", { name: "Try again" }),
  );
  await waitFor(() => expect(attempts).toHaveLength(2));
  expect(attempts[1]).toEqual(attempts[0]);
});
it("quick cash exposes the full receipt page as an optional alternative", async () => {
  backend();
  const { router } = mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Record payment for Sibling A" }),
  );
  await user.click(
    await screen.findByRole("button", {
      name: "More people or receipt details",
    }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toContain("/record-cash"),
  );
  await screen.findByLabelText("Payer label (optional)");
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("quick cash creates an explicit walk-in charge with payment without registration", async () => {
  let submitted: Record<string, unknown> | undefined;
  const candidate = {
    ...a,
    personId: chargeA,
    contactVersion: 3,
    sessionVersion: 4,
    version: 0,
    status: "not_charged",
    canCharge: true,
  };
  const fetcher = backend((_url, init) => {
    if (init?.method === "POST") {
      submitted = JSON.parse(String(init.body));
      return Response.json({ id: chargeB });
    }
    if (_url.pathname.endsWith("/cash"))
      return Response.json({ items: [candidate], summary, nextCursor: null });
  });
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Record payment for Sibling A" }),
  );
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByText(/also adds.*session fee/)).toBeTruthy();
  await user.click(within(sheet).getByRole("button", { name: /Record.*cash/ }));
  await waitFor(() =>
    expect(submitted).toMatchObject({
      allocations: [
        {
          personId: chargeA,
          contactVersion: 3,
          sessionVersion: 4,
          version: 0,
          amountMinor: 1000,
        },
      ],
    }),
  );
  expect(
    fetcher.mock.calls.some(([path]) =>
      String(path).includes("/registrations"),
    ),
  ).toBe(false);
});
it("quick cash requires an explicit balance refresh after a conflict", async () => {
  let fresh = false;
  const submitted: Record<string, unknown>[] = [];
  backend((url, init) => {
    if (init?.method === "POST") {
      submitted.push(JSON.parse(String(init.body)));
      return submitted.length === 1
        ? Response.json({ code: "conflict" }, { status: 409 })
        : Response.json({ id: chargeA });
    }
    if (url.pathname.endsWith("/charges/" + chargeA)) {
      fresh = true;
      return Response.json({
        item: { ...a, outstandingMinor: 600, paidMinor: 400, version: 2 },
      });
    }
  });
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Record payment for Sibling A" }),
  );
  const sheet = await screen.findByRole("dialog");
  await user.click(within(sheet).getByRole("button", { name: /Record.*cash/ }));
  await user.click(
    await within(sheet).findByRole("button", {
      name: "Refresh selected balances",
    }),
  );
  await waitFor(() =>
    expect(
      (within(sheet).getByLabelText("Cash received (EUR)") as HTMLInputElement)
        .value,
    ).toBe("6.00"),
  );
  expect(fresh).toBe(true);
  await user.click(within(sheet).getByRole("button", { name: /Record.*cash/ }));
  await waitFor(() => expect(submitted).toHaveLength(2));
  expect(submitted[1]).toMatchObject({
    amountMinor: 600,
    allocations: [{ chargeId: chargeA, version: 2, amountMinor: 600 }],
  });
  expect(submitted[1]!.key).not.toBe(submitted[0]!.key);
});
it("quick cash clears its private sheet after collection permission is denied", async () => {
  backend((_url, init) =>
    init?.method === "POST"
      ? Response.json({ code: "forbidden" }, { status: 403 })
      : undefined,
  );
  mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Record payment for Sibling A" }),
  );
  const sheet = await screen.findByRole("dialog");
  await user.click(within(sheet).getByRole("button", { name: /Record.*cash/ }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByText("Sibling A")).toBeNull();
});
