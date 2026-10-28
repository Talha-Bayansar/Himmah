import { beforeEach, expect, it, vi } from "vitest";
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
import WorkflowPage from "../src/organization/WorkflowPage";
import {
  formReturn,
  type PageForm,
} from "../src/components/shared/form-navigation";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
const org = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  at = "2026-10-28T10:00:00Z";
function backend(
  role = "owner",
  override?: (u: URL, init?: RequestInit) => Response | undefined,
) {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input), "https://himmah.test"),
        custom = override?.(u, init);
      if (custom) return custom;
      const organization = {
        id: org,
        name: "Community",
        slug: "community",
        timezone: "UTC",
        role,
        createdAt: at,
      };
      if (u.pathname === "/api/account")
        return Response.json({ user: { id: "owner", emailVerified: true } });
      if (u.pathname === "/api/organizations/" + org)
        return Response.json({ organization });
      if (u.pathname === "/api/organizations")
        return Response.json({
          organizations: [organization],
          nextCursor: null,
        });
      if (u.pathname.endsWith("/context"))
        return Response.json({ id: org, name: "Community" });
      if (u.pathname.endsWith("/notifications/unread"))
        return Response.json({ count: 0 });
      if (u.pathname.endsWith("/contacts/" + id))
        return Response.json({
          id,
          displayName: "Subject contact",
          version: 7,
          archivedAt: null,
          createdAt: at,
        });
      if (u.pathname.endsWith("/groups/" + id))
        return Response.json({
          id,
          name: "Subject group",
          version: 4,
          archivedAt: null,
          createdAt: at,
          memberCount: 12,
        });
      if (u.pathname.endsWith("/access/staff"))
        return Response.json({
          items: [{ id: "volunteer", name: "Sam", createdAt: at }],
          nextCursor: null,
        });
      if (u.pathname.endsWith("/groups"))
        return Response.json({
          items: [{ id, name: "Youth group", createdAt: at }],
          nextCursor: null,
        });
      return Response.json({ items: [], nextCursor: null });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mount(form: PageForm, recordId = "new") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const workflow = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/forms/$form/$recordId",
    component: () => {
      const p = workflow.useParams();
      return (
        <WorkflowPage
          organizationId={p.organizationId}
          form={p.form as PageForm}
          recordId={p.recordId}
        />
      );
    },
  });
  const destination = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/$section",
    component: () => <p>Returned to list</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([workflow, destination]),
    history: createMemoryHistory({
      initialEntries: [`/workspace/${org}/forms/${form}/${recordId}`],
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
it.each([
  ["activity", "new", "Create activity"],
  ["access", "new", "Assign volunteer"],
  ["relationship-type", "new", "Add relationship type"],
  ["relationship", id, "Add relationship"],
  ["communication", id, "Add contact person"],
  ["group-members", id, "Add members"],
] as const)(
  "loads the %s form directly from a fresh URL as a page",
  async (form, recordId, title) => {
    backend();
    mount(form, recordId);
    expect(
      await screen.findByRole("heading", { level: 1, name: title }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("region", { name: title })).toBeTruthy();
    if (form === "relationship" || form === "communication")
      expect(screen.getByText(/Subject contact ·/)).toBeTruthy();
    if (form === "group-members")
      expect(screen.getByText(/Subject group ·/)).toBeTruthy();
  },
);
it("a volunteer opening a privileged form URL sees no form and does not fetch target data", async () => {
  const fetcher = backend("volunteer");
  mount("relationship", id);
  await screen.findByRole("alert");
  expect(screen.queryByRole("region", { name: "Add relationship" })).toBeNull();
  expect(
    fetcher.mock.calls.some(([input]) =>
      String(input).includes("/people/contacts/"),
    ),
  ).toBe(false);
});
it("page Back confirms an unsaved draft once and Cancel keeps the draft", async () => {
  backend();
  const { router } = mount("activity");
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText("Activity name"),
    "Draft activity",
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  let dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(
    (screen.getByLabelText("Activity name") as HTMLInputElement).value,
  ).toBe("Draft activity");
  await user.click(screen.getByRole("button", { name: "Back" }));
  dialog = await screen.findByRole("alertdialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Discard changes" }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/workspace/${org}/activities`),
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("staff-access pages freeze an uncertain request and retry with the same key before returning", async () => {
  const writes: Record<string, unknown>[] = [];
  backend("owner", (u, init) => {
    if (u.pathname.endsWith("/access") && init?.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      return writes.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ item: { id } });
    }
  });
  const { router } = mount("access");
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Choose volunteer" }),
  );
  await user.click(await screen.findByRole("button", { name: "Sam" }));
  await user.click(screen.getByRole("button", { name: "Choose group" }));
  await user.click(await screen.findByRole("button", { name: "Youth group" }));
  await user.click(
    screen.getByRole("checkbox", { name: "Record and correct attendance" }),
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/workspace/${org}/access`),
  );
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("form return links preserve filters and reject other organizations or normalized escapes", () => {
  const target = `/workspace/${org}/people/contacts/${id}/communication?q=Sam&history=true`;
  expect(formReturn(target, org)).toBe(target);
  for (const value of [
    "https://example.test",
    `/workspace/${id}/access`,
    `/workspace/${org}/../${id}/access`,
    `/workspace/${org}/forms/activity/new`,
    "//example.test",
  ])
    expect(formReturn(value, org)).toBeNull();
});

it("editing an activity loads its current version independently and saves that version", async () => {
  let submitted: Record<string, unknown> | undefined;
  backend("owner", (u, init) => {
    if (u.pathname.endsWith("/activities/" + id)) {
      if (init?.method === "PATCH") {
        submitted = JSON.parse(String(init.body));
        return Response.json({ item: { id } });
      }
      return Response.json({
        item: {
          id,
          name: "Saved activity",
          description: "",
          location: "",
          timezone: "UTC",
          version: 8,
          audienceGroupIds: [],
          groups: [],
        },
      });
    }
  });
  const { router } = mount("activity", id);
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Activity name");
  expect((name as HTMLInputElement).value).toBe("Saved activity");
  await user.clear(name);
  await user.type(name, "Updated activity");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/workspace/${org}/activities`),
  );
  expect(submitted).toMatchObject({ version: 8, name: "Updated activity" });
  expect(submitted).not.toHaveProperty("key");
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("current authorization loss hides an already opened workflow draft", async () => {
  let denied = false;
  backend("owner", (u) =>
    u.pathname.endsWith("/contacts/" + id) && denied
      ? Response.json({ code: "not_found_or_forbidden" }, { status: 404 })
      : undefined,
  );
  const { client } = mount("relationship", id);
  await screen.findByRole("heading", { name: "Add relationship" });
  denied = true;
  await client.invalidateQueries({
    queryKey: ["people", "owner", org, "workflow", "relationship", id],
  });
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("heading", { name: "Add relationship" }),
  ).toBeNull();
  expect(screen.queryByText(/Subject contact ·/)).toBeNull();
});

it("a denied People save clears the workflow's private cache and hides its draft", async () => {
  backend("owner", (u, init) => {
    if (u.pathname.endsWith("/communication") && init?.method === "POST")
      return Response.json({ code: "not_found_or_forbidden" }, { status: 403 });
    if (u.pathname.endsWith("/contacts"))
      return Response.json({
        items: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            displayName: "Responsible contact",
            version: 2,
            createdAt: at,
            archivedAt: null,
          },
        ],
        nextCursor: null,
      });
  });
  const { client } = mount("communication", id);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("checkbox", { name: "Responsible contact" }),
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Add contact person" }),
    ).toBeNull(),
  );
  expect(screen.queryByText(/Subject contact ·/)).toBeNull();
  expect(client.getQueriesData({ queryKey: ["people"] })).toHaveLength(0);
});
