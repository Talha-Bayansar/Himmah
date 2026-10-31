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
        `/workspace/${org.id}/learning${path === "list" ? "" : path === "new" ? "/new" : path === "assign" ? "/" + id + "/assign" : "/" + id}`,
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
function backend(changed = false) {
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
    draft: changed ? { ...content, title: "Updated draft" } : content,
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
  await user.type(screen.getByLabelText("Question"), "Choose one");
  await user.type(screen.getByLabelText("Option 1"), "First");
  await user.type(screen.getByLabelText("Option 2"), "Second");
  await user.click(
    screen.getByRole("radio", { name: "Correct answer: option 2" }),
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
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
