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
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
import CustomFields, {
  CustomValueInputs,
} from "../src/modules/people/CustomFields";
const org = "11111111-1111-4111-8111-111111111111";
beforeEach(() => setLocale("en", { reload: false }));
function mount() {
  const root = createRootRoute({ component: () => <Outlet /> }),
    route = createRoute({
      getParentRoute: () => root,
      path: "/workspace/$organizationId/$section",
      component: () => <CustomFields org={org} user="owner" />,
    });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({
      initialEntries: [`/workspace/${org}/custom-fields`],
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
      <ConfirmationProvider>
        <RouterProvider router={router} />
      </ConfirmationProvider>
    </QueryClientProvider>,
  );
}
it("keeps a failed field definition locked and retries exactly before closing", async () => {
  const commands: object[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input, init) => {
      if (init?.method === "POST") {
        commands.push(JSON.parse(init.body));
        return commands.length === 1
          ? new Response(JSON.stringify({ code: "service" }), { status: 503 })
          : Response.json({ id: org });
      }
      return Response.json({ fields: [], snapshot: "0".repeat(32) });
    }),
  );
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Add field" }),
  );
  const dialog = screen.getByRole("dialog");
  const label = within(dialog).getByRole("textbox", { name: "Field name" });
  expect(document.activeElement).not.toBe(label);
  await userEvent.type(label, "Language");
  await userEvent.selectOptions(
    within(dialog).getByRole("combobox", { name: "Type" }),
    "choice",
  );
  await userEvent.type(
    within(dialog).getByRole("textbox", { name: /Options/ }),
    "Dutch\nTurkish",
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(label.matches(":disabled")).toBe(true));
  await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(commands).toHaveLength(2);
  expect(commands[0]).toEqual(commands[1]);
});
it("keeps unknown distinct from false and zero in contact field controls", async () => {
  const changes = vi.fn();
  render(
    <CustomValueInputs
      fields={[
        {
          id: "a",
          label: "Number",
          kind: "number",
          required: true,
          options: [],
          version: 1,
          archivedAt: null,
        },
        {
          id: "b",
          label: "Permission",
          kind: "boolean",
          required: true,
          options: [],
          version: 1,
          archivedAt: null,
        },
      ]}
      values={{ a: 0, b: false }}
      onChange={changes}
    />,
  );
  expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("0");
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
    "false",
  );
  await userEvent.selectOptions(screen.getByRole("combobox"), "");
  expect(changes).toHaveBeenCalledWith({ a: 0 });
});

it("removes private definitions and the open form when access is revoked", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input, init) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ code: "not_found_or_forbidden" }), {
            status: 404,
          })
        : Response.json({
            fields: [
              {
                id: org,
                label: "Private field",
                kind: "text",
                required: false,
                options: [],
                archivedAt: null,
                version: 1,
              },
            ],
            snapshot: "0".repeat(32),
          }),
    ),
  );
  mount();
  await screen.findByText("Private field");
  await userEvent.click(screen.getByRole("button", { name: "Add field" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "Field name" }),
    "New field",
  );
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByText("Private field")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add field" })).toBeNull();
});
