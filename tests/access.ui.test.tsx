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
import { AttendanceHistory } from "../src/attendance/AttendanceHistory";
import Sessions from "../src/activities/Sessions";
import Assignments from "../src/access/Assignments";
import VolunteerMembers from "../src/access/VolunteerMembers";
import { AccessEditor } from "../src/access/AccessEditor";
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
  },
  group = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Study group",
    createdAt: org.createdAt,
  },
  staff = { id: "vol-a", name: "Volunteer A", createdAt: org.createdAt },
  grant = {
    id: "33333333-3333-4333-8333-333333333333",
    userId: staff.id,
    staffName: staff.name,
    groupId: group.id,
    activityId: null,
    scopeName: group.name,
    canAttend: true,
    canAward: true,
    version: 1,
    createdAt: org.createdAt,
    revokedAt: null as string | null,
    revokeReason: null,
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
it("creates a scoped grant with independent permissions and exact retry protection", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, init) => {
      if (init?.method === "POST") {
        writes.push(JSON.parse(init.body));
        return writes.length === 1
          ? Response.json({ code: "service" }, { status: 503 })
          : Response.json({ item: grant });
      }
      return Response.json({
        items: String(path).includes("/staff") ? [staff] : [group],
        nextCursor: null,
      });
    }),
  );
  mount(
    <AccessEditor
      base={"/api/organizations/" + org.id}
      scope={["organization", "owner", org.id, "access"]}
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Choose volunteer" }),
  );
  await user.click(
    await within(dialog).findByRole("button", { name: staff.name }),
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Choose group" }),
  );
  await user.click(
    await within(dialog).findByRole("button", { name: group.name }),
  );
  await user.click(
    within(dialog).getByRole("checkbox", {
      name: "Record and correct attendance",
    }),
  );
  expect(
    (
      within(dialog).getByRole("checkbox", {
        name: "Award manual points",
      }) as HTMLButtonElement
    ).getAttribute("data-state"),
  ).toBe("unchecked");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByRole("alert");
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(writes[0]).toMatchObject({
    userId: staff.id,
    groupId: group.id,
    activityId: null,
    canAttend: true,
    canAward: false,
  });
  expect(writes[1]).toEqual(writes[0]);
});
it("requires confirmation before reducing permissions and revoking, and retains revoked history", async () => {
  const user = userEvent.setup();
  let current = { ...grant };
  const writes: { method: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, init) => {
      if (init?.method) {
        writes.push({ method: init.method, body: JSON.parse(init.body) });
        current =
          init.method === "DELETE"
            ? {
                ...current,
                revokedAt: "2026-10-19T12:00:00Z",
                version: current.version + 1,
              }
            : {
                ...current,
                ...JSON.parse(init.body),
                version: current.version + 1,
              };
        return Response.json({ item: current });
      }
      if (String(path).includes("/history"))
        return Response.json({
          items: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              createdAt: org.createdAt,
              action: "revoke",
              actorName: "Organizer",
              after: {
                can_attend: current.canAttend,
                can_award: current.canAward,
              },
            },
          ],
          nextCursor: null,
        });
      return Response.json({
        items:
          String(path).includes("archived=true") === !!current.revokedAt
            ? [current]
            : [],
        nextCursor: null,
      });
    }),
  );
  mount(<Assignments organization={org} userId="owner" />);
  await screen.findByText(staff.name);
  await user.click(
    screen.getByRole("button", { name: "Actions for " + staff.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Change permissions" }),
  );
  let dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("checkbox", { name: "Award manual points" }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(writes).toHaveLength(0);
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Change permissions",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(writes[0]).toMatchObject({
    method: "PATCH",
    body: { canAttend: true, canAward: false, version: 1 },
  });
  await user.click(
    screen.getByRole("button", { name: "Actions for " + staff.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Revoke assignment" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(writes).toHaveLength(1);
  await user.click(
    screen.getByRole("button", { name: "Actions for " + staff.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Revoke assignment" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Revoke assignment",
    }),
  );
  await waitFor(() => expect(screen.queryByText(staff.name)).toBeNull());
  await user.click(
    screen.getByRole("checkbox", { name: "Show revoked assignments" }),
  );
  await screen.findByText(staff.name);
  await user.click(
    screen.getByRole("button", { name: "Actions for " + staff.name }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Assignment history" }),
  );
  dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("Revoked");
  expect(writes).toHaveLength(2);
});
it("does not fetch a member roster when a volunteer has no manual-award assignment", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path) => {
      requests.push(String(path));
      return Response.json({ item: { canAttend: true, canAward: false } });
    }),
  );
  mount(
    <VolunteerMembers
      organization={{ ...org, role: "volunteer" }}
      userId="vol-a"
    />,
  );
  await screen.findByText(
    "You have no active manual-points assignment. Ask an organizer to assign your work.",
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain("/access/me");
  expect(screen.queryByRole("searchbox")).toBeNull();
});
it("uses only the scoped work roster for volunteer bulk-award selection", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path) => {
      requests.push(String(path));
      return String(path).includes("/access/me")
        ? Response.json({ item: { canAttend: false, canAward: true } })
        : Response.json({
            items: [
              {
                id: group.id,
                name: "Assigned member",
                createdAt: org.createdAt,
              },
            ],
            nextCursor: null,
          });
    }),
  );
  mount(
    <VolunteerMembers
      organization={{ ...org, role: "volunteer" }}
      userId="vol-a"
    />,
  );
  await screen.findByText("Assigned member");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Award points" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("checkbox", { name: "Assigned member" });
  expect(
    requests.filter((path) => path.includes("/work/members")).length,
  ).toBeGreaterThanOrEqual(2);
  expect(requests.some((path) => path.includes("/people"))).toBe(false);
});

it("hides loaded session details after a paginated request loses authorization", async () => {
  const activity = {
    ...group,
    description: "",
    location: "",
    timezone: "UTC",
    cancelled: false,
    version: 1,
    audienceGroupIds: [],
    groups: [],
    nextSession: null,
  };
  const session = {
    ...activity,
    id: grant.id,
    activityId: activity.id,
    name: "Private session",
    startsAt: "2099-01-01T10:00Z",
    endsAt: "2099-01-01T11:00Z",
    cancellationReason: "",
    canAttend: true,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path) =>
      String(path).includes("cursor=")
        ? Response.json({ code: "forbidden" }, { status: 403 })
        : Response.json({ items: [session], nextCursor: "next" }),
    ),
  );
  mount(
    <Sessions
      organization={{ ...org, role: "volunteer" }}
      userId="vol-a"
      activity={activity}
      sessionId={null}
    />,
  );
  await screen.findByRole("link", { name: "View session" });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("link", { name: "View session" })).toBeNull();
});
it("hides loaded attendance reasons after a paginated history request loses authorization", async () => {
  const person = {
    ...group,
    archived: false,
    eligible: true,
    status: "present" as const,
    version: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path) =>
      String(path).includes("cursor=")
        ? Response.json({ code: "forbidden" }, { status: 403 })
        : Response.json({
            items: [
              {
                id: grant.id,
                createdAt: org.createdAt,
                beforeStatus: "unmarked",
                afterStatus: "present",
                reason: "Private correction reason",
                actorName: "Organizer",
                version: 1,
              },
            ],
            nextCursor: "next",
          }),
    ),
  );
  mount(
    <AttendanceHistory
      person={person}
      path="/api/test/attendance"
      queryKey={["test-history"]}
      timezone="UTC"
      onClose={() => {}}
    />,
  );
  await screen.findByText("Private correction reason");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("Private correction reason")).toBeNull();
});
