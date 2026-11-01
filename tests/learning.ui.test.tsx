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
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
import { CopyLink } from "../src/learning/shared";
import Learning from "../src/learning/Learning";
import Participant from "../src/learning/Participant";
import { freshContent } from "../src/learning/contracts";
const org = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Community",
    slug: "community",
    role: "owner" as const,
    timezone: "Europe/Brussels",
    createdAt: "2026-01-01T00:00:00Z",
  },
  id = "22222222-2222-4222-8222-222222222222",
  pub = "33333333-3333-4333-8333-333333333333",
  attemptId = "44444444-4444-4444-8444-444444444444";
const content = {
  ...freshContent(),
  title: "Patience",
  questions: [
    {
      text: "Choose one",
      choices: ["First", "Second"],
      correct: 1,
      explanation: "Second is correct",
    },
    { text: "Another", choices: ["Yes", "No"], correct: 0, explanation: "" },
  ],
};
beforeEach(() => {
  setLocale("en", { reload: false });
  window.history.replaceState({}, "", "/");
  vi.stubGlobal("IntersectionObserver", undefined);
});
function mountStaff(path = "detail", role: "owner" | "volunteer" = "owner") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const list = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/learning",
    component: () => (
      <Learning organization={{ ...org, role }} userId="owner" />
    ),
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/learning/$learningId",
    component: () => (
      <Learning
        organization={{ ...org, role }}
        userId="owner"
        id={detail.useParams().learningId}
      />
    ),
  });
  const edit = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/learning/$learningId/edit",
    component: () => (
      <Learning
        organization={{ ...org, role }}
        userId="owner"
        id={id}
        mode="edit"
      />
    ),
  });
  const assign = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/learning/$learningId/assign",
    component: () => (
      <Learning
        organization={{ ...org, role }}
        userId="owner"
        id={id}
        mode="assign"
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([list, detail, edit, assign]),
    history: createMemoryHistory({
      initialEntries: [
        `/workspace/${org.id}/learning${path === "list" ? "" : path === "new" ? "/new" : path === "assign" ? "/" + id + "/assign" : path === "edit" ? "/" + id + "/edit" : "/" + id}`,
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
  return { client, router };
}
function backend(changed = false, draftOverride?: typeof content) {
  let revision = 3;
  const posts: Record<string, any>[] = [];
  const recipient = {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Alex",
    contactId: "66666666-6666-4666-8666-666666666666",
    revoked: false,
    allowance: 1,
    revision: 1,
    createdAt: org.createdAt,
    attempts: 1,
    score: 2,
    submittedAt: org.createdAt,
    status: "submitted",
  };
  const item = {
    id,
    title: "Patience",
    description: "",
    activityId: null,
    sessionId: null,
    activityName: null,
    sessionTopic: null,
    draft:
      draftOverride ??
      (changed ? { ...content, title: "Updated draft" } : content),
    state: "published",
    version: revision,
    currentPublication: pub,
    createdAt: org.createdAt,
  };
  let released = false,
    failOnce = false;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input), "https://himmah.test");
      if (init?.method === "POST") {
        const b = JSON.parse(String(init.body));
        posts.push(b);
        revision++;
        if (failOnce) {
          failOnce = false;
          return Response.json({ code: "service" }, { status: 503 });
        }
        return Response.json({
          id: u.pathname.split("/").at(-1),
          version: revision,
          publication: pub,
        });
      }
      if (u.pathname.endsWith("/options"))
        return Response.json({
          items: [
            { id: recipient.contactId, name: "Alex", createdAt: org.createdAt },
            {
              id: "77777777-7777-4777-8777-777777777777",
              name: "Sam",
              createdAt: org.createdAt,
            },
          ],
          nextCursor: null,
        });
      if (u.pathname.endsWith("/results/" + recipient.id))
        return Response.json({
          name: "Alex",
          questions: content.questions,
          attempts: [
            {
              id: attemptId,
              sequence: 1,
              answers: { 0: 1, 1: 0 },
              score: 2,
              submittedAt: org.createdAt,
            },
          ],
        });
      if (
        u.pathname.endsWith("/participants") ||
        u.pathname.endsWith("/results")
      )
        return Response.json({ items: [recipient], nextCursor: null });
      if (u.pathname.endsWith("/" + id))
        return Response.json({
          item: { ...item, version: revision },
          publication: {
            id: pub,
            number: 1,
            released,
            hasLink: false,
            content,
          },
          versions: [{ id: pub, number: 1 }],
          counts: { assigned: 1, started: 1, submitted: 1 },
        });
      return Response.json({ items: [item], nextCursor: null });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return {
    posts,
    fetcher,
    fail: () => {
      failOnce = true;
    },
  };
}
it("staff can open an independent item, inspect participant attempt history and see withheld-result controls", async () => {
  backend();
  mountStaff();
  await screen.findByRole("heading", { name: "Patience", level: 1 });
  expect(screen.getByRole("link", { name: "Assign contacts" })).toBeTruthy();
  await userEvent.click(await screen.findByRole("button", { name: /^Alex/ }));
  const sheet = await screen.findByRole("dialog");
  expect(await within(sheet).findByText("Attempt 1 · 2/2")).toBeTruthy();
  await userEvent.click(within(sheet).getByText("Attempt 1 · 2/2"));
  expect(within(sheet).getByText("Choose one")).toBeTruthy();
});
it("published draft changes require explicit new publication instead of changing participant content", async () => {
  backend(true);
  mountStaff();
  await screen.findByRole("heading", { name: "Patience", level: 1 });
  expect(
    screen.getByRole("button", { name: "Publish a new version" }),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Assign contacts" })).toBeNull();
  expect(screen.getByText(/Draft changes are not live/)).toBeTruthy();
});
it("multi-contact assignment generates private links in one explicit request and keeps the exact failed request for retry", async () => {
  const b = backend();
  b.fail();
  mountStaff("assign");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox", { name: "Alex" }));
  await user.click(screen.getByRole("checkbox", { name: "Sam" }));
  await user.click(screen.getByRole("button", { name: "Generate 2 links" }));
  await screen.findByText(/response was not received/);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText(/Links are ready/);
  expect(b.posts.length).toBe(2);
  expect(b.posts[0]).toEqual(b.posts[1]);
  expect(b.posts[0]!.recipients.length).toBe(2);
  expect(
    screen.getAllByRole("textbox", { name: "Participant link" }).length,
  ).toBe(2);
});
it("new item editor supports standalone questions without autofocus and saves before navigating", async () => {
  const b = backend();
  const { router } = mountStaff("new");
  const user = userEvent.setup();
  const title = await screen.findByLabelText("Title");
  expect(document.activeElement).not.toBe(title);
  await user.type(title, "Independent quiz");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.type(screen.getByLabelText("Question"), "Choose one");
  await user.type(screen.getByLabelText("Option 1"), "First");
  await user.type(screen.getByLabelText("Option 2"), "Second");
  await user.click(
    screen.getByRole("radio", { name: "Correct answer: option 2" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(b.posts.length).toBe(1));
  expect(b.posts[0]!.content.questions[0].correct).toBe(1);
  expect(b.posts[0]!.activity).toBeNull();
  await waitFor(() =>
    expect(router.state.location.pathname).not.toContain("/new"),
  );
});
it("volunteers cannot request learning administration", async () => {
  const b = backend();
  mountStaff("list", "volunteer");
  await screen.findByRole("alert");
  expect(b.fetcher).not.toHaveBeenCalled();
});
function mountParticipant() {
  window.history.replaceState({}, "", `/learn/${id}#${"a".repeat(64)}`);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <Participant item={id} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return client;
}
function publicBackend() {
  let a: any = null,
    released = false,
    fail = false,
    denied = false;
  const posts: any[] = [];
  const receipts = new Map();
  let last: any;
  const data = () => ({
    title: content.title,
    description: "A short quiz",
    mode: "open",
    release: "manual",
    opensAt: "",
    closesAt: "",
    number: 1,
    available: true,
    name: a ? "Guest" : null,
    allowance: 1,
    questions: content.questions.map((q) =>
      released && a?.submittedAt ? q : { text: q.text, choices: q.choices },
    ),
    attempt: a
      ? {
          ...a,
          score: released && a.submittedAt ? 2 : null,
          released: released && !!a.submittedAt,
          total: 2,
        }
      : null,
  });
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input), "https://himmah.test");
      if (denied) return Response.json({ code: "not_found" }, { status: 404 });
      if (u.pathname.endsWith("/access")) return Response.json({ ok: true });
      if (init?.method === "POST") {
        const b = JSON.parse(String(init.body));
        posts.push(b);
        last = b;
        if (receipts.has(b.key)) return Response.json(receipts.get(b.key));
        if (b.action === "start")
          a = {
            id: attemptId,
            sequence: 1,
            answers: {},
            revision: 1,
            submittedAt: null,
          };
        if (b.action === "answer") {
          a.answers = { ...a.answers, [b.question]: b.choice };
          a.revision++;
        }
        if (b.action === "submit") {
          a.submittedAt = "2026-10-31T12:00:00Z";
          a.revision++;
        }
        const r = { id: attemptId, revision: a.revision };
        receipts.set(b.key, r);
        if (fail) {
          fail = false;
          return Response.json({ code: "service" }, { status: 503 });
        }
        return Response.json(r);
      }
      return Response.json(data());
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return {
    posts,
    fetcher,
    release: () => {
      released = true;
    },
    fail: () => {
      fail = true;
    },
    deny: () => {
      denied = true;
    },
  };
}
it("public participation saves choices, reviews and submits without revealing answers before release", async () => {
  const b = publicBackend();
  mountParticipant();
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Your display name");
  expect(location.hash).toBe("");
  expect(document.activeElement).not.toBe(name);
  await user.type(name, "Guest");
  await user.click(screen.getByRole("button", { name: "Start" }));
  await screen.findByRole("group", { name: "Choose one" });
  await user.click(screen.getByRole("radio", { name: "Second" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("radio", { name: "Yes" }));
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Review answers" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Review answers" }));
  await user.click(screen.getByRole("button", { name: "Submit answers" }));
  await screen.findByRole("heading", { name: "Submission saved" });
  expect(screen.queryByText("Second is correct")).toBeNull();
  expect(screen.queryByText("2 out of 2 points")).toBeNull();
  b.release();
  await user.click(screen.getByRole("button", { name: "Refresh results" }));
  await screen.findByText("2 out of 2 points");
  expect(screen.getByText("Second is correct")).toBeTruthy();
  expect(b.posts.filter((p) => p.action === "submit").length).toBe(1);
  expect(b.posts.some((p) => "score" in p || "correct" in p)).toBe(false);
});
it("a lost answer response locks navigation and retries exactly before continuing", async () => {
  const b = publicBackend();
  mountParticipant();
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Your display name"), "Guest");
  await user.click(screen.getByRole("button", { name: "Start" }));
  await screen.findByRole("radio", { name: "Second" });
  b.fail();
  await user.click(screen.getByRole("radio", { name: "Second" }));
  await screen.findByText(/response was not received/);
  expect(
    screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Retry the same save" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  const answers = b.posts.filter((p) => p.action === "answer");
  expect(answers.length).toBe(2);
  expect(answers[0]).toEqual(answers[1]);
});
it("revoked public access hides cached participant results without a request loop", async () => {
  const b = publicBackend();
  const client = mountParticipant();
  await screen.findByLabelText("Your display name");
  b.deny();
  await client.refetchQueries({ queryKey: ["learning-public"] });
  await screen.findByRole("heading", {
    name: "Unable to open this learning item",
  });
  expect(screen.queryByLabelText("Your display name")).toBeNull();
  expect(
    client
      .getQueryCache()
      .getAll()
      .some((q) => q.state.data),
  ).toBe(false);
});

it("wizard validates the current step and keeps all questions and access settings across overview navigation", async () => {
  const b = backend();
  mountStaff("new");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Next" }));
  expect(screen.getByRole("alert").textContent).toMatch(/title/);
  expect(b.posts.length).toBe(0);
  await user.type(screen.getByLabelText("Title"), "Wizard quiz");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Add question" }));
  expect(
    (screen.getByLabelText("Select a question") as HTMLSelectElement).value,
  ).toBe("1");
  await user.type(screen.getByLabelText("Question"), "Second question");
  await user.type(screen.getByLabelText("Option 1"), "Yes");
  await user.type(screen.getByLabelText("Option 2"), "No");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("alert").textContent).toMatch(/question 1/);
  expect(
    (screen.getByLabelText("Select a question") as HTMLSelectElement).value,
  ).toBe("0");
  await user.type(screen.getByLabelText("Question"), "First question");
  await user.type(screen.getByLabelText("Option 1"), "One");
  await user.type(screen.getByLabelText("Option 2"), "Two");
  await user.selectOptions(screen.getByLabelText("Select a question"), "1");
  expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe(
    "Second question",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.selectOptions(screen.getByLabelText("Participation"), "open");
  await user.selectOptions(screen.getByLabelText("Release results"), "manual");
  await user.type(
    screen.getByLabelText("Opens (optional)"),
    "2026-11-03T12:00",
  );
  await user.type(
    screen.getByLabelText("Deadline (optional)"),
    "2026-11-02T12:00",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("alert").textContent).toMatch(/availability dates/);
  await user.clear(screen.getByLabelText("Deadline (optional)"));
  await user.type(
    screen.getByLabelText("Deadline (optional)"),
    "2026-11-04T12:00",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("heading", { name: "Review" })).toBeTruthy();
  expect(b.posts.length).toBe(0);
  await user.click(screen.getByRole("button", { name: "Edit question 2" }));
  expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe(
    "Second question",
  );
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Learning creation steps" }),
    ).getByRole("button", { name: "Review" }),
  );
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(b.posts.length).toBe(1));
  expect(b.posts[0]!.content.questions.map((q: any) => q.text)).toEqual([
    "First question",
    "Second question",
  ]);
  expect(b.posts[0]!.content.mode).toBe("open");
  expect(b.posts[0]!.content.release).toBe("manual");
  expect(b.posts[0]!.content.opensAt).toBe("2026-11-03T11:00:00.000Z");
});
it("question controls duplicate, reorder and remove the selected question without losing its options", async () => {
  backend();
  mountStaff("edit");
  const user = userEvent.setup();
  await screen.findByLabelText("Title");
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Learning creation steps" }),
    ).getByRole("button", { name: "Questions" }),
  );
  const menu = async () =>
    user.click(screen.getByRole("button", { name: /Actions for Question/ }));
  await menu();
  await user.click(
    screen.getByRole("menuitem", { name: "Duplicate question" }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Select a question") as HTMLSelectElement).value,
    ).toBe("1"),
  );
  expect((screen.getByLabelText("Option 2") as HTMLInputElement).value).toBe(
    "Second",
  );
  await menu();
  await user.click(
    screen.getByRole("menuitem", { name: "Move question down" }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Select a question") as HTMLSelectElement).value,
    ).toBe("2"),
  );
  expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe(
    "Choose one",
  );
  await menu();
  await user.click(screen.getByRole("menuitem", { name: "Remove question" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Remove question",
    }),
  );
  expect(
    (screen.getByLabelText("Select a question") as HTMLSelectElement).options
      .length,
  ).toBe(2);
  expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe(
    "Another",
  );
});
it("fifty-question drafts render one editable question and keep creation controls bounded", async () => {
  backend(false, {
    ...content,
    questions: Array.from({ length: 50 }, (_, i) => ({
      ...content.questions[0]!,
      text: "Question " + (i + 1),
    })),
  });
  mountStaff("edit");
  const user = userEvent.setup();
  await screen.findByLabelText("Title");
  await user.click(
    within(
      screen.getByRole("navigation", { name: "Learning creation steps" }),
    ).getByRole("button", { name: "Questions" }),
  );
  expect(
    (screen.getByLabelText("Select a question") as HTMLSelectElement).options
      .length,
  ).toBe(50);
  expect(document.querySelectorAll(".learning-question textarea").length).toBe(
    2,
  );
  expect(
    screen
      .getByRole("button", { name: "Add question" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await user.selectOptions(screen.getByLabelText("Select a question"), "49");
  expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe(
    "Question 50",
  );
});
it("a wizard save with a lost response locks every step and replays the reviewed draft exactly", async () => {
  const b = backend();
  b.fail();
  mountStaff("edit");
  const user = userEvent.setup();
  await screen.findByLabelText("Title");
  const nav = screen.getByRole("navigation", {
    name: "Learning creation steps",
  });
  await user.click(within(nav).getByRole("button", { name: "Review" }));
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/response was not received/);
  expect(
    within(nav)
      .getAllByRole("button")
      .every((b) => b.hasAttribute("disabled")),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(b.posts.length).toBe(2));
  expect(b.posts[0]).toEqual(b.posts[1]);
});

it("shows distinct released feedback without repeating correct answers, and hides unreleased feedback", async () => {
  const { ParticipantFeedback } =
    await import("../src/learning/ParticipantFeedback");
  const data: import("../src/learning/contracts").PublicLearning = {
    questionCount: 3,
    title: "Practice",
    description: "",
    mode: "open",
    opensAt: "",
    closesAt: "",
    release: "manual",
    number: 1,
    available: true,
    name: null,
    allowance: 1,
    questions: [
      {
        text: "Correct question",
        choices: ["Correct choice", "Other"],
        correct: 0,
        explanation: "Why this works",
      },
      {
        text: "Incorrect question",
        choices: ["Chosen", "Expected"],
        correct: 1,
      },
      {
        text: "Skipped question",
        choices: ["Expected skipped", "Other"],
        correct: 0,
      },
    ],
    attempt: {
      id: attemptId,
      sequence: 1,
      answers: { 0: 0, 1: 0 },
      revision: 1,
      submittedAt: "2026-10-31T12:00:00Z",
      score: 1,
      total: 3,
      released: true,
    },
  };
  const { rerender } = render(<ParticipantFeedback data={data} />);
  const rows = screen.getAllByRole("listitem");
  expect(within(rows[0]!).getByText("Correct", { exact: true })).toBeTruthy();
  expect(within(rows[0]!).getAllByText("Correct choice")).toHaveLength(1);
  expect(within(rows[0]!).getByText("Why this works")).toBeTruthy();
  expect(within(rows[1]!).getByText("Incorrect", { exact: true })).toBeTruthy();
  expect(within(rows[1]!).getByText("Chosen")).toBeTruthy();
  expect(within(rows[1]!).getByText("Expected")).toBeTruthy();
  expect(within(rows[2]!).getByText("Expected skipped")).toBeTruthy();
  rerender(
    <ParticipantFeedback
      data={{ ...data, attempt: { ...data.attempt!, released: false } }}
    />,
  );
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByText("Expected")).toBeNull();
});

it("celebrates submission for every score and never displays a held score", async () => {
  const { ParticipantFinish } =
    await import("../src/learning/ParticipantPresentation");
  const data: import("../src/learning/contracts").PublicLearning = {
    ...content,
    questionCount: 2,
    number: 1,
    available: true,
    name: "Guest",
    allowance: 1,
    attempt: {
      id: attemptId,
      sequence: 1,
      answers: {},
      revision: 2,
      submittedAt: "2026-11-01T12:00:00Z",
      score: 2,
      total: 2,
      released: false,
    },
  };
  const { rerender } = render(
    <ParticipantFinish
      data={data}
      date="1 November"
      refresh={<button>Refresh results</button>}
    />,
  );
  expect(screen.getByText("Quiz complete!")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Refresh results" })).toBeTruthy();
  expect(screen.queryByText("2 out of 2 points")).toBeNull();
  rerender(
    <ParticipantFinish
      data={{
        ...data,
        attempt: { ...data.attempt!, released: true, score: 0 },
      }}
      date="1 November"
      refresh={null}
    />,
  );
  expect(screen.getByText("Quiz complete!")).toBeTruthy();
  expect(screen.getByText("0 out of 2 points")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Refresh results" })).toBeNull();
  expect(screen.queryByText(/passed|failed/i)).toBeNull();
});

it("opens a bookmarked contact-history result for its selected publication and removes the recipient parameter when closed", async () => {
  backend();
  const { router } = mountStaff();
  await screen.findByRole("heading", { name: "Patience", level: 1 });
  await router.navigate({
    to: "/workspace/$organizationId/learning/$learningId",
    params: { organizationId: org.id, learningId: id },
    search: {
      publication: pub,
      recipient: "55555555-5555-4555-8555-555555555555",
      tab: "results",
      q: "",
      activity: "",
      session: "",
    },
  });
  const sheet = await screen.findByRole("dialog");
  expect(await within(sheet).findByText("Attempt 1 · 2/2")).toBeTruthy();
  await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    new URLSearchParams(router.state.location.searchStr).get("recipient"),
  ).toBeNull();
  expect(
    new URLSearchParams(router.state.location.searchStr).get("publication"),
  ).toBe(pub);
});

it("provides manual copying without focusing the field when compact clipboard copying fails", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
    new Error("Unavailable"),
  );
  render(<CopyLink compact value="https://example.test/play/ABCDE12345" />);
  expect(
    screen.queryByRole("textbox", { name: "Participant link" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  const input = await screen.findByRole("textbox", {
    name: "Participant link",
  });
  expect((input as HTMLInputElement).value).toBe(
    "https://example.test/play/ABCDE12345",
  );
  expect(document.activeElement).not.toBe(input);
  expect(screen.getByRole("status").textContent).toBe(
    "Select and copy the link manually.",
  );
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
});
