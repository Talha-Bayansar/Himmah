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
import { AttendanceEditor } from "../src/attendance/AttendanceEditor";
import { EntityEditor } from "../src/activities/EntityEditor";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
const person = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Member One",
  createdAt: "2020-01-01T00:00:00Z",
  archived: false,
  eligible: true,
  status: "unmarked" as const,
  version: 0,
};
function mount(component: React.ReactNode) {
  const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
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
});
it("previews linked points before saving and preserves the exact confirmed request after uncertain failure", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    requests: { path: string; body: Record<string, unknown> }[] = [];
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, init) => {
      requests.push({ path: String(path), body: JSON.parse(init.body) });
      if (String(path).endsWith("/preview"))
        return Response.json({
          items: [
            {
              personId: person.id,
              outcome: "saved",
              pointsDelta: 10,
              status: "present",
              version: 1,
            },
          ],
        });
      writes++;
      return writes === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({
            items: [
              {
                personId: person.id,
                outcome: "saved",
                pointsDelta: 10,
                status: "present",
                version: 1,
              },
            ],
          });
    }),
  );
  mount(
    <AttendanceEditor
      records={[person]}
      ruleAmount={10}
      path="/api/test/attendance"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("button", {
      name: "Review attendance and points",
    }),
  );
  await within(dialog).findByText("Point change: +10");
  expect(writes).toBe(0);
  expect(requests).toHaveLength(1);
  await user.click(
    within(dialog).getByRole("button", {
      name: "Confirm attendance and points",
    }),
  );
  await within(dialog).findByRole("alert");
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(requests[1]!.body.confirmPoints).toBe(true);
  expect(requests[2]!.body).toEqual(requests[1]!.body);
});
it("requires confirmation before reversing linked points, and cancel does not save", async () => {
  const user = userEvent.setup(),
    saved = vi.fn();
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path) => {
      if (!String(path).endsWith("/preview")) writes++;
      return Response.json({
        items: [
          {
            personId: person.id,
            outcome: "saved",
            pointsDelta: -10,
            status: "absent",
            version: 2,
          },
        ],
      });
    }),
  );
  mount(
    <AttendanceEditor
      records={[{ ...person, status: "present", version: 1 }]}
      ruleAmount={10}
      path="/api/test/attendance"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.selectOptions(
    within(dialog).getByLabelText("Attendance status"),
    "absent",
  );
  await user.type(
    within(dialog).getByLabelText("Correction reason"),
    "Correcting mistaken check-in",
  );
  await user.click(
    within(dialog).getByRole("button", {
      name: "Review attendance and points",
    }),
  );
  await within(dialog).findByText("Point change: -10");
  await user.click(
    within(dialog).getByRole("button", {
      name: "Confirm attendance and points",
    }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(writes).toBe(0);
  await user.click(
    within(dialog).getByRole("button", {
      name: "Confirm attendance and points",
    }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Confirm correction",
    }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(writes).toBe(1);
});
it("keeps earning disabled by default and saves an explicit opt-in amount for future sessions", async () => {
  const user = userEvent.setup(),
    save = vi.fn();
  mount(
    <EntityEditor
      kind="activity"
      activity={null}
      organization={{
        id: "11111111-1111-4111-8111-111111111111",
        name: "Test",
        slug: "test-org",
        role: "owner",
        timezone: "UTC",
        createdAt: "2020-01-01T00:00:00Z",
      }}
      userId="owner"
      onClose={() => {}}
      onSave={save}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).queryByLabelText("Points for being present"),
  ).toBeNull();
  await user.type(
    within(dialog).getByLabelText("Activity name"),
    "Learning evening",
  );
  await user.click(
    within(dialog).getByRole("checkbox", {
      name: "Award points for attendance in new sessions",
    }),
  );
  const amount = within(dialog).getByLabelText("Points for being present");
  await user.clear(amount);
  await user.type(amount, "12");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]![0].attendancePoints).toBe(12);
});
