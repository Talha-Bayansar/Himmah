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
import LivePlayer from "../src/live/LivePlayer";
import LiveHost from "../src/live/LiveHost";
import { LearningScope } from "../src/learning/shared";
import type { LearningDetail } from "../src/learning/contracts";
const code = "ABCDEF1234",
  org = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Community",
    slug: "community",
    role: "owner" as const,
    timezone: "Europe/Brussels",
    createdAt: "2026-11-01T12:00:00Z",
  },
  item = "22222222-2222-4222-8222-222222222222",
  room = "33333333-3333-4333-8333-333333333333",
  publication = "44444444-4444-4444-8444-444444444444";
const content = {
  title: "Live quiz",
  description: "",
  mode: "assigned" as const,
  release: "manual" as const,
  opensAt: "",
  closesAt: "",
  questions: [
    {
      text: "Which choice?",
      choices: ["First", "Second"],
      correct: 1,
      explanation: "Second is correct.",
    },
  ],
};
const detail: LearningDetail = {
  item: {
    id: item,
    title: content.title,
    description: "",
    activityId: null,
    sessionId: null,
    activityName: null,
    sessionTopic: null,
    draft: content,
    state: "published",
    version: 1,
    currentPublication: publication,
    createdAt: org.createdAt,
  },
  publication: {
    id: publication,
    number: 1,
    released: false,
    hasLink: false,
    content,
  },
  versions: [{ id: publication, number: 1 }],
  counts: { assigned: 0, started: 0, submitted: 0 },
};
beforeEach(() => {
  setLocale("en", { reload: false });
  vi.stubGlobal("IntersectionObserver", undefined);
});
function mount(mode: "public" | "host" = "public", initial = "") {
  const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
    root = createRootRoute({ component: () => <Outlet /> });
  const player = createRoute({
    getParentRoute: () => root,
    path: "/play/$code",
    component: () => <LivePlayer code={code} />,
  });
  const entry = createRoute({
    getParentRoute: () => root,
    path: "/play",
    component: () => <LivePlayer />,
  });
  const host = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/learning/$learningId/live",
    validateSearch: (s: Record<string, unknown>) => ({
      room: typeof s.room === "string" ? s.room : "",
    }),
    component: () => (
      <LearningScope org={org} user="owner">
        <LiveHost detail={detail} />
      </LearningScope>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([player, entry, host]),
    history: createMemoryHistory({
      initialEntries: [
        mode === "public"
          ? "/play/" + code
          : `/workspace/${org.id}/learning/${item}/live${initial}`,
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
function backend() {
  let phase = "lobby",
    version = 1,
    revision = 1,
    joined = false,
    choice: number | null = null,
    fail = false,
    denied = false;
  const calls: { path: string; body: Record<string, any> }[] = [],
    receipts = new Map<string, any>();
  const state = () => ({
    id: room,
    code,
    title: "Live quiz",
    state: phase,
    questionIndex: phase === "lobby" ? -1 : 0,
    questionCount: 1,
    version,
    expired: false,
    expiresAt: "2099-01-01T12:00:00Z",
    joined,
    participants: joined ? 1 : 0,
    answered: choice === null ? 0 : 1,
    ...(phase !== "lobby"
      ? {
          question:
            phase === "revealed" || phase === "finished"
              ? content.questions[0]
              : {
                  text: content.questions[0]!.text,
                  choices: content.questions[0]!.choices,
                },
        }
      : {}),
    ...(joined
      ? {
          player: {
            number: 1,
            nickname: null,
            revision,
            choice,
            score: phase === "finished" ? (choice === 1 ? 1 : 0) : null,
          },
        }
      : {}),
    played: phase === "lobby" ? 0 : 1,
    summary:
      phase === "finished"
        ? [{ index: 0, text: "Which choice?", answered: 1, correct: 1 }]
        : [],
    distribution: [
      { choice: 0, count: 0 },
      { choice: 1, count: 1 },
    ],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "https://himmah.test").pathname;
      if (denied)
        return Response.json({ code: "live_revoked" }, { status: 403 });
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        calls.push({ path, body });
        if (receipts.has(body.key))
          return Response.json(receipts.get(body.key));
        if (path.endsWith("/join")) {
          joined = true;
        } else if (path.endsWith("/answer")) {
          choice = body.choice;
          revision++;
        } else {
          if (body.action === "start") phase = "question";
          if (body.action === "lock") phase = "locked";
          if (body.action === "reveal") phase = "revealed";
          if (body.action === "finish") phase = "finished";
          version++;
        }
        const result = { id: room, version, revision, code };
        receipts.set(body.key, result);
        if (fail) {
          fail = false;
          return Response.json({ code: "service" }, { status: 503 });
        }
        return Response.json(result);
      }
      if (path.endsWith("/players"))
        return Response.json({ items: [], nextCursor: null });
      if (path.endsWith("/live"))
        return Response.json({
          items: [
            {
              id: room,
              code,
              state: phase,
              title: "Live quiz",
              expiresAt: "2099-01-01T12:00:00Z",
              createdAt: org.createdAt,
            },
          ],
          nextCursor: null,
        });
      return Response.json(state());
    }),
  );
  return {
    calls,
    fail: () => {
      fail = true;
    },
    phase: (v: string) => {
      phase = v;
      version++;
    },
    join: () => {
      joined = true;
    },
    deny: () => {
      denied = true;
    },
  };
}
it("normalizes a room code and lets anonymous participants join without autofocus or early answer keys", async () => {
  const b = backend(),
    { client, router } = mount("public");
  const user = userEvent.setup();
  const nickname = await screen.findByRole("textbox", {
    name: "Nickname (optional)",
  });
  expect(document.activeElement).not.toBe(nickname);
  await user.click(screen.getByRole("button", { name: "Join quiz" }));
  await screen.findByRole("heading", { name: "You’re in!" });
  expect(screen.getByText("Playing as Player 1")).toBeTruthy();
  expect(b.calls[0]!.body.nickname).toBe("");
  expect(b.calls[0]!.body.token).toHaveLength(64);
  b.phase("question");
  await client.invalidateQueries({ queryKey: ["live-public"] });
  await screen.findByRole("radio", { name: "Second" });
  expect(screen.queryByText("Second is correct.")).toBeNull();
  await user.click(screen.getByRole("radio", { name: "Second" }));
  await screen.findByText("Answer saved");
  expect(b.calls.at(-1)!.body).not.toHaveProperty("score");
  b.phase("locked");
  await client.invalidateQueries({ queryKey: ["live-public"] });
  await screen.findByText("Answers are locked");
  expect(
    (screen.getByRole("radio", { name: "Second" }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByText("Second is correct.")).toBeNull();
  b.phase("revealed");
  await client.invalidateQueries({ queryKey: ["live-public"] });
  await screen.findByText("Second is correct.");
  b.phase("finished");
  await client.invalidateQueries({ queryKey: ["live-public"] });
  await screen.findByText("1 out of 1 points");
  await user.click(screen.getByRole("link", { name: "Join another quiz" }));
  await user.type(
    screen.getByRole("textbox", { name: "Room code" }),
    "abcde-f1234",
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/play/ABCDEF1234"),
  );
});
it("retries the original join endpoint and credential even if polling discovers the committed join", async () => {
  const b = backend(),
    { client } = mount();
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Join quiz" });
  b.fail();
  await user.click(screen.getByRole("button", { name: "Join quiz" }));
  await screen.findByRole("button", { name: "Retry the same save" });
  await client.invalidateQueries({ queryKey: ["live-public"] });
  await screen.findByRole("heading", { name: "You’re in!" });
  await user.click(screen.getByRole("button", { name: "Retry the same save" }));
  await waitFor(() => expect(b.calls.length).toBe(2));
  expect(b.calls[1]).toEqual(b.calls[0]);
});
it("holds an uncertain answer until exact replay and hides private data after removal", async () => {
  const b = backend();
  b.join();
  b.phase("question");
  const { client } = mount();
  const user = userEvent.setup();
  await screen.findByRole("radio", { name: "Second" });
  b.fail();
  await user.click(screen.getByRole("radio", { name: "Second" }));
  await screen.findByRole("button", { name: "Retry the same save" });
  expect(
    (screen.getByRole("radio", { name: "First" }) as HTMLInputElement).disabled,
  ).toBe(true);
  b.phase("locked");
  await client.invalidateQueries({ queryKey: ["live-public"] });
  await user.click(screen.getByRole("button", { name: "Retry the same save" }));
  await waitFor(() => expect(b.calls.length).toBe(2));
  expect(b.calls[1]).toEqual(b.calls[0]);
  b.deny();
  await client.invalidateQueries({ queryKey: ["live-public"] });
  await screen.findByRole("alert");
  await waitFor(() => expect(screen.queryByText("Which choice?")).toBeNull());
  expect(
    client
      .getQueryCache()
      .findAll({ queryKey: ["live-public"] })
      .every((q) => !q.state.data),
  ).toBe(true);
});
it("host opens a room then starts, locks, reveals and finishes with one primary phase action", async () => {
  const b = backend(),
    { router } = mount("host");
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Open a room" });
  await user.click(screen.getByRole("button", { name: "Open a room" }));
  await waitFor(() =>
    expect(
      new URLSearchParams(router.state.location.searchStr).get("room"),
    ).toBe(room),
  );
  expect(
    (
      (await screen.findByRole("button", {
        name: "Start quiz",
      })) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  b.join();
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Start quiz" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Start quiz" }));
  await screen.findByRole("button", { name: "Lock answers" });
  expect(screen.queryByText("Second is correct.")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Lock answers" }));
  await screen.findByRole("button", { name: "Reveal answer" });
  expect(screen.queryByText("Second is correct.")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Reveal answer" }));
  await screen.findByText("Second is correct.");
  await user.click(screen.getByRole("button", { name: "Finish quiz" }));
  await screen.findByRole("heading", { name: "Group summary" });
  expect(screen.queryByRole("button", { name: "Start quiz" })).toBeNull();
});
