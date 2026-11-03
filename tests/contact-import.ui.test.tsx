import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
import ContactImport from "../src/modules/people/ContactImport";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
const org = "11111111-1111-4111-8111-111111111111";
const review = {
  snapshot: "a".repeat(32),
  rows: [
    { row: 2, matchCount: 0, matches: [], fileMatches: [], fileMatchCount: 0 },
    {
      row: 3,
      matchCount: 1,
      matches: [
        { id: org, name: "Existing person", version: 1, archived: true },
      ],
      fileMatches: [],
      fileMatchCount: 0,
    },
  ],
};
function mount(
  handler: (
    path: string,
    body: Record<string, unknown>,
  ) => Response | Promise<Response>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const path = String(input);
      if (path.includes("contact-import/"))
        return handler(path, JSON.parse(String(init?.body)));
      if (path.endsWith("/api/account"))
        return Response.json({
          user: {
            id: "owner",
            name: "Synthetic Owner",
            emailVerified: true,
            email: "owner@example.test",
          },
        });
      const organization = {
        id: org,
        name: "Synthetic Community",
        slug: "synthetic",
        timezone: "Europe/Brussels",
        role: "owner",
        createdAt: "2026-11-01T10:00:00Z",
      };
      if (path.endsWith("/api/organizations"))
        return Response.json({
          organizations: [organization],
          nextCursor: null,
        });
      if (path.includes("notifications/unread"))
        return Response.json({ count: 0 });
      if (path.endsWith("/context"))
        return Response.json({ id: org, name: organization.name });
      return Response.json({ organization });
    }),
  );
  const root = createRootRoute({ component: () => <Outlet /> }),
    page = createRoute({
      getParentRoute: () => root,
      path: "/workspace/$organizationId/people/contacts/import",
      component: () => <ContactImport organizationId={org} />,
    }),
    list = createRoute({
      getParentRoute: () => root,
      path: "/workspace/$organizationId/people/contacts",
      component: () => <p>Contacts destination</p>,
    });
  const router = createRouter({
    routeTree: root.addChildren([page, list]),
    history: createMemoryHistory({
      initialEntries: [`/workspace/${org}/people/contacts/import`],
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
        <ConfirmationProvider>
          <RouterProvider router={router} />
        </ConfirmationProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  setLocale("en", { reload: false });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("IntersectionObserver", undefined);
});
async function columns(
  user: ReturnType<typeof userEvent.setup>,
  csv = "Name,Email\nNew person,new@example.test\nPossible duplicate,duplicate@example.test",
) {
  const input = await screen.findByLabelText("CSV file");
  expect(document.activeElement).not.toBe(input);
  const file = new File([csv], "synthetic.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => csv });
  await user.upload(input, file);
  await user.click(await screen.findByRole("button", { name: "Continue" }));
  await user.selectOptions(screen.getByLabelText("Display name"), "0");
  await user.selectOptions(screen.getByLabelText("Email"), "1");
}
it("opens independently, defaults to skipping duplicates and creates only reviewed rows", async () => {
  const writes: Record<string, unknown>[] = [];
  mount((path, body) => {
    if (path.endsWith("commit")) {
      writes.push(body);
      return Response.json({ created: 1, skipped: 1 });
    }
    return Response.json(review);
  });
  const user = userEvent.setup();
  await columns(user);
  await user.click(screen.getByRole("button", { name: "Check contacts" }));
  await screen.findByText(/Existing person/);
  const boxes = screen.getAllByRole("checkbox") as HTMLButtonElement[];
  expect(boxes[0]!.getAttribute("aria-checked")).toBe("true");
  expect(boxes[1]!.getAttribute("aria-checked")).toBe("false");
  await user.click(screen.getByRole("button", { name: "Create contacts (1)" }));
  await screen.findByRole("heading", { name: "Import complete" });
  expect(writes[0]!.selected).toEqual([2]);
  await user.click(screen.getByRole("link", { name: "View contacts" }));
  await screen.findByText("Contacts destination");
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("retains a reviewed unknown save and retries exactly the same key and selection", async () => {
  const writes: Record<string, unknown>[] = [];
  mount((path, body) => {
    if (path.endsWith("commit")) {
      writes.push(body);
      if (writes.length === 1) throw new TypeError("offline");
      return Response.json({ created: 1, skipped: 1 });
    }
    return Response.json(review);
  });
  const user = userEvent.setup();
  await columns(user);
  await user.click(screen.getByRole("button", { name: "Check contacts" }));
  await user.click(
    await screen.findByRole("button", { name: "Create contacts (1)" }),
  );
  await screen.findByRole("button", { name: "Try again" });
  expect(
    screen.getAllByRole("checkbox")[0]!.closest("fieldset")!.disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Import complete" });
  expect(writes[1]).toEqual(writes[0]);
});
it("requires a fresh duplicate review on conflict and resets selection to safe defaults", async () => {
  let reviews = 0;
  const writes: Record<string, unknown>[] = [];
  mount((path, body) => {
    if (path.endsWith("commit")) {
      writes.push(body);
      return writes.length === 1
        ? Response.json({ code: "version_conflict" }, { status: 409 })
        : Response.json({ created: 1, skipped: 1 });
    }
    reviews++;
    return Response.json({
      ...review,
      snapshot: (reviews === 1 ? "a" : "b").repeat(32),
    });
  });
  const user = userEvent.setup();
  await columns(user);
  await user.click(screen.getByRole("button", { name: "Check contacts" }));
  await user.click(
    await screen.findByRole("button", { name: "Create contacts (1)" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Check contacts again" }),
  );
  await waitFor(() => expect(reviews).toBe(2));
  await user.click(screen.getByRole("button", { name: "Create contacts (1)" }));
  await screen.findByRole("heading", { name: "Import complete" });
  expect(writes[1]!.snapshot).toBe("b".repeat(32));
  expect(writes[1]!.key).not.toBe(writes[0]!.key);
});
it("invalid data requires an explicit skip and cancelled dismissal preserves the file and mapping", async () => {
  mount(() => Response.json({ ...review, rows: review.rows.slice(0, 1) }));
  const user = userEvent.setup();
  await columns(
    user,
    "Name,Email\nNew person,new@example.test\nInvalid,not-email",
  );
  expect(
    screen.getByRole("button", { name: "Check contacts" }).matches(":disabled"),
  ).toBe(true);
  await user.click(
    screen.getByRole("checkbox", { name: "Skip 1 invalid rows" }),
  );
  expect(
    screen.getByRole("button", { name: "Check contacts" }).matches(":disabled"),
  ).toBe(false);
  await user.click(screen.getAllByRole("button", { name: "Back" })[0]!);
  await user.click(screen.getAllByRole("button", { name: "Back" })[0]!);
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.getByText(/synthetic.csv/)).toBeTruthy();
});
