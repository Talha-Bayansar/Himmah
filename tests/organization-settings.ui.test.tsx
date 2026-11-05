import { beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
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
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
import OrganizationSettings from "../src/organization/OrganizationSettings";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Community",
  slug: "community",
  timezone: "Europe/Brussels",
  role: "owner" as const,
  createdAt: "2026-11-05T12:00Z",
};
const config = {
  name: "Community",
  description: "",
  email: "",
  phone: "",
  timezone: "Europe/Brussels",
  defaultLanguage: null,
  quietEnabled: true,
  quietStart: 1320,
  quietEnd: 480,
  version: 0,
};
beforeEach(() => setLocale("en", { reload: false }));
function mount() {
  const root = createRootRoute({ component: () => <Outlet /> }),
    route = createRoute({
      getParentRoute: () => root,
      path: "/workspace/$organizationId/$section",
      component: () =>
        route.useParams().section === "manage" ? (
          <p>Manage destination</p>
        ) : (
          <OrganizationSettings organization={org} user="owner" />
        ),
    });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({
      initialEntries: [`/workspace/${org.id}/organization`],
    }),
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <ConfirmationProvider>
        <LocaleProvider>
          <RouterProvider router={router} />
        </LocaleProvider>
      </ConfirmationProvider>
    </QueryClientProvider>,
  );
  return cache;
}
it("locks an unconfirmed settings command and retries identically before returning to Manage", async () => {
  const commands: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input, init) => {
      if (init?.method === "POST") {
        commands.push(JSON.parse(init.body));
        return commands.length === 1
          ? new Response(JSON.stringify({ code: "service" }), { status: 503 })
          : Response.json({ id: org.id, version: 1 });
      }
      return Response.json(config);
    }),
  );
  mount();
  const name = await screen.findByLabelText("Organization name");
  expect(document.activeElement).not.toBe(name);
  await userEvent.clear(name);
  await userEvent.type(name, "Updated community");
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Default language" }),
    "tr",
  );
  fireEvent.change(screen.getByLabelText("From"), {
    target: { value: "21:30" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(name.matches(":disabled")).toBe(true));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Manage destination");
  expect(commands).toHaveLength(2);
  expect(commands[0]).toEqual(commands[1]);
  expect(commands[0]?.quietStart).toBe(1290);
  expect(commands[0]?.defaultLanguage).toBe("tr");
  expect(document.documentElement.lang).toBe("en");
});
it("uses the shared searchable timezone sheet and keeps the current choice visible", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(config)),
  );
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Timezone" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog)
      .getByRole("button", { name: "Europe/Brussels" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  const search = within(dialog).getByRole("searchbox");
  expect(document.activeElement).not.toBe(search);
  await userEvent.type(search, "İstanbul");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Europe/Istanbul" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Timezone" }).textContent,
  ).toContain("Europe/Istanbul");
});

it("keeps a dirty draft across background refresh and reloads only after explicit discard", async () => {
  let current = { ...config },
    offline = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      offline
        ? new Response(JSON.stringify({ code: "service" }), { status: 503 })
        : Response.json(current),
    ),
  );
  const cache = mount();
  const name = await screen.findByLabelText("Organization name");
  await userEvent.clear(name);
  await userEvent.type(name, "Local draft");
  offline = true;
  await cache.invalidateQueries({
    queryKey: ["organization", "owner", org.id, "settings"],
  });
  expect(
    (screen.getByLabelText("Organization name") as HTMLInputElement).value,
  ).toBe("Local draft");
  offline = false;
  current = { ...config, name: "Remote update", version: 1 };
  await cache.invalidateQueries({
    queryKey: ["organization", "owner", org.id, "settings"],
  });
  expect(
    (screen.getByLabelText("Organization name") as HTMLInputElement).value,
  ).toBe("Local draft");
  await screen.findByText(/New settings are available/);
  await userEvent.click(
    screen.getByRole("button", { name: "Reload latest settings" }),
  );
  const dialog = screen.getByRole("alertdialog");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Discard changes" }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Organization name") as HTMLInputElement).value,
    ).toBe("Remote update"),
  );
});
