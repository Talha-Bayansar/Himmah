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

import ParticipantAccountPage from "../src/participants/ParticipantAccountPage";
import PersonalDashboard from "../src/participants/PersonalDashboard";
import { ParticipantEditor } from "../src/participants/ParticipantEditor";
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
it("requires consent and retries the exact email-bound invitation after an uncertain save", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      writes.push(JSON.parse(init.body));
      return writes.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ id: "invite" });
    }),
  );
  mount(
    <ParticipantEditor
      path="/api/test"
      personName="Nickname A"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  const submit = within(dialog).getByRole("button", {
    name: "Invite participant",
  }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  await user.type(
    within(dialog).getByLabelText("Email address"),
    "participant@example.invalid",
  );
  await user.click(within(dialog).getByRole("checkbox"));
  await user.click(submit);
  await within(dialog).findByRole("alert");
  expect(
    (within(dialog).getByLabelText("Email address") as HTMLInputElement)
      .disabled,
  ).toBe(true);
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0]).toMatchObject({
    email: "participant@example.invalid",
    consent: true,
  });
  const share = new URL(saved.mock.calls[0]![0]);
  expect(share.pathname).toBe("/participate");
  expect(share.search).toBe("");
  expect(share.hash.slice(1)).toBe(writes[0]!.token);
});
it("requires a disconnect reason and confirmation, and cancel sends no request", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, init) => {
      writes.push(JSON.parse(init.body));
      return Response.json({ id: "link" });
    }),
  );
  mount(
    <ParticipantEditor
      path="/api/test"
      personName="Nickname A"
      linkId="link"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByRole("textbox"), "Consent withdrawn");
  await user.click(
    within(dialog).getByRole("button", { name: "Disconnect account" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(writes).toHaveLength(0);
  await user.click(
    within(dialog).getByRole("button", { name: "Disconnect account" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Disconnect account",
    }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(writes).toEqual([{ reason: "Consent withdrawn" }]);
});
it("shows a private read-only wallet, retains loaded points on a page service failure, and hides them after revocation", async () => {
  const user = userEvent.setup();
  let nextStatus = 503;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const path = String(input);
      if (path.endsWith("/me"))
        return Response.json({
          item: {
            name: "My nickname",
            earned: "25",
            reserved: "5",
            spent: "0",
            available: "20",
          },
        });
      if (path.includes("cursor="))
        return Response.json(
          { code: nextStatus === 403 ? "forbidden" : "service" },
          { status: nextStatus },
        );
      return Response.json({
        items: [
          {
            id: "point",
            amount: 25,
            source: "manual",
            isAdjustment: false,
            currentAmount: 25,
            createdAt: org.createdAt,
            occurredAt: org.createdAt,
          },
        ],
        nextCursor: "next",
      });
    }),
  );
  mount(
    <PersonalDashboard
      organization={{ ...org, role: "participant" }}
      userId="participant"
    />,
  );
  await screen.findByText("My nickname");
  await screen.findByText("+25");
  expect(screen.queryByRole("button", { name: /award points/i })).toBeNull();
  await user.click(await screen.findByRole("button", { name: "Load more" }));
  await screen.findByRole("button", { name: "Try again" });
  expect(screen.getByText("My nickname")).toBeTruthy();
  expect(screen.getByText("+25")).toBeTruthy();
  nextStatus = 403;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByText("My nickname")).toBeNull());
  expect(screen.queryByText("+25")).toBeNull();
});
it("lists available reward claims without staff management controls", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) =>
      String(input).endsWith("/me")
        ? Response.json({
            item: {
              name: "My nickname",
              earned: "25",
              reserved: "5",
              spent: "0",
              available: "20",
            },
          })
        : Response.json({
            items: [
              {
                id: "reward",
                name: "Drink coupon",
                description: "A drink from the cafe",
                cost: 5,
                inStock: true,
                eligible: true,
                createdAt: org.createdAt,
              },
            ],
            nextCursor: null,
          }),
    ),
  );
  mount(
    <PersonalDashboard
      organization={{ ...org, role: "participant" }}
      userId="participant"
      view="rewards"
    />,
  );
  await screen.findByText("Drink coupon");
  expect(screen.getByText(/Choose a reward/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /reserve|purchase|create reward/i }),
  ).toBeNull();
});

it("hides the linked email and member details when a later access-history request loses authorization", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const path = String(input);
      if (path.endsWith("/participants/member"))
        return Response.json({
          item: {
            person: { id: "member", name: "Private nickname", archived: false },
            link: {
              id: "link",
              email: "private@example.invalid",
              createdAt: org.createdAt,
            },
            pending: false,
          },
        });
      if (path.includes("cursor="))
        return Response.json({ code: "forbidden" }, { status: 403 });
      return Response.json({
        items: [
          {
            id: "invite",
            email: "invited@example.invalid",
            createdAt: org.createdAt,
            expiresAt: "2099-01-01T00:00:00Z",
            consentAttestedAt: org.createdAt,
            revokedAt: null,
            accepted: true,
          },
        ],
        nextCursor: "next",
      });
    }),
  );
  mount(
    <ParticipantAccountPage
      organization={org}
      userId="owner"
      memberId="member"
    />,
  );
  await screen.findByText("private@example.invalid");
  await user.click(await screen.findByRole("button", { name: "Load more" }));
  await waitFor(() =>
    expect(screen.queryByText("private@example.invalid")).toBeNull(),
  );
  expect(screen.queryByText("Private nickname")).toBeNull();
  expect(screen.queryByText("invited@example.invalid")).toBeNull();
});
