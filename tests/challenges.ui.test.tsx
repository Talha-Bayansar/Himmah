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
import Challenges from "../src/challenges/Challenges";
import {
  ChallengeEditor,
  ChallengeActionDialog,
} from "../src/challenges/ChallengeDialogs";
import { LocaleProvider } from "../src/localization/locale";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { setLocale } from "../src/paraglide/runtime.js";
import type { Challenge, Submission } from "../src/challenges/contracts";
const org = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Test organization",
    slug: "test-org",
    timezone: "UTC",
    role: "owner" as const,
    createdAt: "2020-01-01T00:00:00Z",
  },
  id = "22222222-2222-4222-8222-222222222222";
const challenge: Challenge = {
  id,
  name: "Help prepare an event",
  description: "Help with the event",
  points: 15,
  status: "published",
  version: 2,
  createdAt: org.createdAt,
  startsAt: null,
  endsAt: null,
  groups: [],
  eligible: true,
  open: true,
  submission: null,
};
const submission: Submission = {
  id: "33333333-3333-4333-8333-333333333333",
  challengeId: id,
  challengeName: challenge.name,
  personName: "Nickname A",
  points: 15,
  challengeVersion: 2,
  note: "I helped prepare",
  status: "pending",
  version: 1,
  createdAt: org.createdAt,
  submittedAt: org.createdAt,
  reviewedAt: null,
  feedback: "",
  canReview: true,
};
function mount(component: React.ReactNode) {
  const root = createRootRoute({ component: () => <Outlet /> }),
    page = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => component,
    });
  const router = createRouter({
    routeTree: root.addChildren([
      page,
      createRoute({
        getParentRoute: () => root,
        path: "/workspace/$organizationId/challenges/$challengeId",
        component: () => <p>Challenge saved</p>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/workspace/$organizationId/$section",
        component: () => <p>Destination</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
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
it("keeps a dirty challenge draft when discard is cancelled and performs no write", async () => {
  const fetcher = vi.fn(),
    close = vi.fn(),
    user = userEvent.setup();
  vi.stubGlobal("fetch", fetcher);
  mount(
    <ChallengeEditor
      organization={org}
      userId="owner"
      onClose={close}
      onSaved={() => {}}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Challenge name"), "Help out");
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(close).not.toHaveBeenCalled();
  expect(within(dialog).getByLabelText("Challenge name")).toHaveProperty(
    "value",
    "Help out",
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it("saves a configurable draft with a receipt and no hard-coded quiz or attendance", async () => {
  const writes: Record<string, unknown>[] = [],
    saved = vi.fn(),
    user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_p, init) => {
      writes.push(JSON.parse(init.body));
      return Response.json({ item: challenge });
    }),
  );
  mount(
    <ChallengeEditor
      organization={org}
      userId="owner"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Challenge name"), "Help out");
  await user.type(
    within(dialog).getByLabelText("What should participants do?"),
    "Prepare the hall",
  );
  await user.clear(within(dialog).getByLabelText("Points for completion"));
  await user.type(within(dialog).getByLabelText("Points for completion"), "15");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(id));
  expect(writes[0]).toMatchObject({
    action: "create",
    points: 15,
    groups: [],
    startsAt: "",
    endsAt: "",
  });
  expect(writes[0]?.key).toEqual(expect.any(String));
});
it("publishes only after confirmation and leaves the draft untouched on cancel", async () => {
  const fetcher = vi.fn(async (_p: unknown, _init: RequestInit | undefined) =>
      Response.json({ item: challenge }),
    ),
    saved = vi.fn(),
    user = userEvent.setup();
  vi.stubGlobal("fetch", fetcher);
  mount(
    <ChallengeActionDialog
      organization={org}
      userId="owner"
      challenge={{ ...challenge, status: "draft", version: 1 }}
      action="publish"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("button", {
      name: "Publish challenge",
    }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(
    within(dialog).getByRole("button", {
      name: "Publish challenge",
    }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Publish challenge",
    }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body))).toMatchObject({
    action: "publish",
    version: 1,
  });
});
it("freezes participant submissions and safely retries the exact key, note and reviewed version", async () => {
  const writes: Record<string, unknown>[] = [],
    saved = vi.fn(),
    user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_p, init) => {
      writes.push(JSON.parse(init.body));
      return writes.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ item: challenge });
    }),
  );
  mount(
    <ChallengeActionDialog
      organization={{ ...org, role: "participant" }}
      userId="child"
      challenge={challenge}
      action="submit"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Completion note (optional)"),
    "I helped",
  );
  await user.click(
    within(dialog).getByRole("button", {
      name: "Submit completion",
    }),
  );
  await within(dialog).findByRole("alert");
  expect(
    within(dialog).getByLabelText("Completion note (optional)"),
  ).toHaveProperty("disabled", true);
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0]).toMatchObject({
    action: "submit",
    challengeVersion: 2,
    version: null,
    note: "I helped",
  });
  expect(writes[0]).not.toHaveProperty("personId");
  expect(writes[0]).not.toHaveProperty("points");
});
it("approves only after confirmation and retries an uncertain decision without another award request", async () => {
  const writes: Record<string, unknown>[] = [],
    saved = vi.fn(),
    user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_p, init) => {
      writes.push(JSON.parse(init.body));
      return writes.length === 1
        ? Response.json({ code: "service" }, { status: 503 })
        : Response.json({ item: submission });
    }),
  );
  mount(
    <ChallengeActionDialog
      organization={org}
      userId="owner"
      challenge={challenge}
      submission={submission}
      action="approve"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("button", {
      name: "Approve completion",
    }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(writes).toHaveLength(0);
  await user.click(
    within(dialog).getByRole("button", {
      name: "Approve completion",
    }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Approve completion",
    }),
  );
  await within(dialog).findByRole("alert");
  await user.click(within(dialog).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0]).toMatchObject({ action: "approve", version: 1 });
});
it("requires participant-visible feedback when asking for another attempt", async () => {
  const fetcher = vi.fn(),
    user = userEvent.setup();
  vi.stubGlobal("fetch", fetcher);
  mount(
    <ChallengeActionDialog
      organization={org}
      userId="owner"
      challenge={challenge}
      submission={submission}
      action="reject"
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByLabelText("Feedback for the participant"),
  ).toHaveProperty("required", true);
  await user.click(
    within(dialog).getByRole("button", {
      name: "Ask for another attempt",
    }),
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("loads paginated completion candidates and sends their current submission version", async () => {
  const writes: Record<string, unknown>[] = [],
    saved = vi.fn(),
    user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_p, init) => {
      if (init?.method === "POST") {
        writes.push(JSON.parse(init.body));
        return Response.json({ item: submission });
      }
      return Response.json({
        items: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Nickname B",
            createdAt: org.createdAt,
            submissionVersion: 2,
          },
        ],
        nextCursor: null,
      });
    }),
  );
  mount(
    <ChallengeActionDialog
      organization={org}
      userId="owner"
      challenge={challenge}
      action="record"
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    await within(dialog).findByRole("button", {
      name: "Nickname B",
    }),
  );
  await user.type(
    within(dialog).getByLabelText("Feedback for the participant"),
    "Verified together",
  );
  await user.click(
    within(dialog).getByRole("button", {
      name: "Record completion",
    }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Record completion",
    }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(writes[0]).toMatchObject({
    action: "record",
    version: 2,
    feedback: "Verified together",
  });
});
it("retains loaded challenge pages after service failure but hides them after permission loss", async () => {
  let status = 503;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (p) =>
      String(p).includes("cursor=next")
        ? Response.json(
            { code: status === 503 ? "service" : "forbidden" },
            { status },
          )
        : Response.json({ items: [challenge], nextCursor: "next" }),
    ),
  );
  mount(<Challenges organization={org} userId="owner" />);
  await screen.findByText(challenge.name);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByText(challenge.name)).not.toBeNull();
  status = 403;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByText(challenge.name)).toBeNull());
});
it("hides private review details immediately after an authorization failure", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ code: "forbidden" }, { status: 403 })),
  );
  mount(
    <ChallengeActionDialog
      organization={org}
      userId="owner"
      challenge={challenge}
      submission={submission}
      action="approve"
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Approve completion" }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Approve completion",
    }),
  );
  await screen.findByRole("alert");
  expect(screen.queryByText(submission.personName!)).toBeNull();
  expect(screen.queryByText(challenge.name)).toBeNull();
});
