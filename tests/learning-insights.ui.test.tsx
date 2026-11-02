import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LearningScope } from "../src/learning/shared";
import LearningInsights from "../src/learning/LearningInsights";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
import type { LearningInsights as Report } from "../src/learning/contracts";
const item = "22222222-2222-4222-8222-222222222222",
  pub = "33333333-3333-4333-8333-333333333333";
const org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Community",
  slug: "community",
  role: "owner" as const,
  timezone: "Europe/Brussels",
  createdAt: "2026-11-01T00:00Z",
};
const report: Report = {
  publicationId: pub,
  number: 1,
  mode: "assigned",
  questionCount: 2,
  generatedAt: "2026-11-02T10:00:00Z",
  participants: 4,
  completed: 2,
  inProgress: 2,
  notStarted: 1,
  revoked: 1,
  averageScore: 0.5,
  distribution: [
    { score: 0, count: 1 },
    { score: 1, count: 1 },
    { score: 2, count: 0 },
  ],
  questions: [
    {
      index: 0,
      text: "First question",
      correct: 1,
      incorrect: 0,
      unanswered: 1,
      choices: [
        { text: "First", correct: false, count: 0 },
        { text: "Second", correct: true, count: 1 },
      ],
    },
    {
      index: 1,
      text: "Second question",
      correct: 0,
      incorrect: 1,
      unanswered: 1,
      choices: [
        { text: "Yes", correct: true, count: 0 },
        { text: "No", correct: false, count: 1 },
      ],
    },
  ],
};
beforeEach(() => setLocale("en", { reload: false }));
function mount(publication = pub, role: "owner" | "volunteer" = "owner") {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (selected: string) => (
    <QueryClientProvider client={cache}>
      <LocaleProvider>
        <LearningScope org={{ ...org, role }} user="owner">
          <LearningInsights key={selected} item={item} publication={selected} />
        </LearningScope>
      </LocaleProvider>
    </QueryClientProvider>
  );
  const result = render(view(publication));
  return {
    cache,
    change: (selected: string) => result.rerender(view(selected)),
  };
}
it("shows factual latest-submission metrics, accessible score selection and one question at a time without focus", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(report)),
  );
  mount();
  await screen.findByText("2 of 4 assignments completed");
  expect(screen.getByText("0.5 / 2")).toBeTruthy();
  expect(
    screen.queryByRole("region", { name: "Score distribution" }),
  ).toBeNull();
  await user.click(
    screen.getByText("Score distribution", { selector: "summary" }),
  );
  await user.selectOptions(
    await screen.findByRole("combobox", { name: "Score" }),
    "2",
  );
  expect(
    screen.getByText("Score 2 of 2 · Participants: 0", { selector: "p" })
      .textContent,
  ).toBe("Score 2 of 2 · Participants: 0");
  await user.click(
    screen.getByText("Question analysis", { selector: "summary" }),
  );
  expect(screen.getByRole("heading", { name: "First question" })).toBeTruthy();
  const selector = screen.getByRole("combobox", { name: "Question" });
  expect(document.activeElement).not.toBe(selector);
  await user.selectOptions(selector, "1");
  expect(screen.queryByRole("heading", { name: "First question" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Second question" })).toBeTruthy();
  expect(
    screen.getByText("0 correct · 1 incorrect · 1 unanswered"),
  ).toBeTruthy();
  await user.click(
    screen.getByText("About these results", { selector: "summary" }),
  );
  expect(
    screen.getByText(/Earlier attempts and unfinished answers/),
  ).toBeTruthy();
  expect(screen.getByText("Revoked entries")).toBeTruthy();
});
it("keeps zero scores distinct from empty results and explains unverified open entries", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn(async () =>
    Response.json({ ...report, mode: "open", averageScore: 0 }),
  );
  vi.stubGlobal("fetch", fetcher);
  mount();
  await screen.findByText("4 unverified guest entries");
  expect(screen.getByText("0 / 2")).toBeTruthy();
  expect(screen.queryByText(/assignments completed/)).toBeNull();
  await user.click(
    screen.getByText("About these results", { selector: "summary" }),
  );
  expect(
    screen.getByText(/No completion percentage is available/),
  ).toBeTruthy();
  fetcher.mockImplementation(async () =>
    Response.json({ ...report, completed: 0, averageScore: null }),
  );
  await user.click(screen.getByRole("button", { name: "Refresh results" }));
  expect(
    await screen.findByText("Results will appear after the first submission."),
  ).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy();
  expect(
    screen.queryByText("Score distribution", { selector: "summary" }),
  ).toBeNull();
});
it("isolates publications, resets question selection and keeps failed refresh data hidden until retry", async () => {
  const user = userEvent.setup();
  let failed = false;
  const fetcher = vi.fn(async (input: RequestInfo | URL) =>
    failed
      ? Response.json({ code: "service" }, { status: 503 })
      : Response.json(
          String(input).includes("publication=" + pub)
            ? report
            : {
                ...report,
                publicationId: "44444444-4444-4444-8444-444444444444",
                completed: 1,
                averageScore: 0,
                questions: [report.questions[0]],
              },
        ),
  );
  vi.stubGlobal("fetch", fetcher);
  const { change } = mount();
  await screen.findByText("0.5 / 2");
  await user.click(
    screen.getByText("Question analysis", { selector: "summary" }),
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Question" }),
    "1",
  );
  change("44444444-4444-4444-8444-444444444444");
  await screen.findByText("1 of 4 assignments completed");
  expect(screen.queryByRole("heading", { name: "Second question" })).toBeNull();
  failed = true;
  await user.click(screen.getByRole("button", { name: "Refresh results" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("0 / 2")).toBeNull();
  failed = false;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("1 of 4 assignments completed");
  expect(
    fetcher.mock.calls.every(([input]) =>
      String(input).includes(`/learning/${item}/insights?publication=`),
    ),
  ).toBe(true);
});
it("hides private report values and clears caches after access loss, ", async () => {
  const user = userEvent.setup();
  let denied = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      denied
        ? Response.json({ code: "forbidden" }, { status: 403 })
        : Response.json(report),
    ),
  );
  const { cache } = mount();
  await screen.findByText("0.5 / 2");
  denied = true;
  await user.click(screen.getByRole("button", { name: "Refresh results" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("0.5 / 2")).toBeNull();
  await waitFor(() =>
    expect(
      cache.getQueriesData({
        queryKey: ["organization", "owner", org.id, "learning"],
      }),
    ).toEqual([]),
  );
});

it("does not request insights for a volunteer", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  mount(pub, "volunteer");
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
