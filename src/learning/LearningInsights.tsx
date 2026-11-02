import { lazy, Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCheck,
  ChartNoAxesColumnIncreasing,
  RefreshCw,
} from "lucide-react";
import { useLearning } from "./shared";
import type { LearningInsights as Report } from "./contracts";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import { ActionButton } from "../components/shared/action-button";
import { ListSkeleton } from "../components/shared/infinite-list";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Label } from "../components/ui/label";
import { ErrorNotice } from "../activities/Activities";
const ScoreChart = lazy(() => import("./ScoreDistributionChart"));

export default function LearningInsights({
  item,
  publication,
}: {
  item: string;
  publication: string;
}) {
  const { base, prefix, api, org } = useLearning();
  const cache = useQueryClient();
  const locale = useLocale()?.locale ?? "en";
  const [distributionOpen, setDistributionOpen] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedScore, setSelectedScore] = useState(0);
  const query = useQuery({
    queryKey: [...prefix, "insights", item, publication],
    queryFn: ({ signal }) =>
      api<Report>(`${base}/${item}/insights?publication=${publication}`, {
        signal,
      }),
    retry: false,
  });
  const data = query.data;
  const number = (n: number) => n.toLocaleString(locale);
  const question = data?.questions[questionIndex];
  const bin = data?.distribution.find((r) => r.score === selectedScore);
  return (
    <section
      className="learning-insights"
      aria-labelledby="learning-insights-heading"
    >
      <div className="learning-insights-heading">
        <h2 id="learning-insights-heading">{m.learn_insights()}</h2>
        <ActionButton
          variant="outline"
          size="icon"
          aria-label={m.learn_insights_refresh()}
          pending={query.isFetching}
          onClick={() => void cache.invalidateQueries({ queryKey: prefix })}
        >
          <RefreshCw aria-hidden="true" />
        </ActionButton>
      </div>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : (
        data && (
          <>
            <p className="activity-note">
              {data.mode === "assigned"
                ? m.learn_insights_assigned({
                    completed: number(data.completed),
                    total: number(data.participants),
                  })
                : m.learn_insights_guests({ total: number(data.participants) })}
            </p>
            <dl className="learning-insights-metrics">
              <div>
                <dt>
                  <CheckCheck aria-hidden="true" />
                  {m.learn_insights_completed()}
                </dt>
                <dd>{number(data.completed)}</dd>
              </div>
              <div>
                <dt>
                  <ChartNoAxesColumnIncreasing aria-hidden="true" />
                  {m.learn_insights_average()}
                </dt>
                <dd>
                  {data.averageScore === null
                    ? "—"
                    : m.learn_insights_score({
                        score: data.averageScore.toLocaleString(locale, {
                          maximumFractionDigits: 1,
                        }),
                        total: number(data.questionCount),
                      })}
                </dd>
              </div>
            </dl>
            {!data.completed ? (
              <p className="directory-empty">{m.learn_insights_empty()}</p>
            ) : (
              <>
                <details
                  className="session-help learning-insights-disclosure"
                  open={distributionOpen}
                  onToggle={(e) => setDistributionOpen(e.currentTarget.open)}
                >
                  <summary>{m.learn_insights_distribution()}</summary>
                  {distributionOpen && (
                    <div className="learning-insights-body">
                      <div className="learning-field">
                        <Label htmlFor="learning-score-selection">
                          {m.learn_insights_score_label()}
                        </Label>
                        <NativeSelect
                          id="learning-score-selection"
                          value={selectedScore}
                          onChange={(e) =>
                            setSelectedScore(Number(e.target.value))
                          }
                        >
                          {data.distribution.map((row) => (
                            <NativeSelectOption
                              key={row.score}
                              value={row.score}
                            >
                              {m.learn_insights_bin({
                                score: number(row.score),
                                total: number(data.questionCount),
                                count: number(row.count),
                              })}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                      <Suspense fallback={<ListSkeleton />}>
                        <ScoreChart
                          distribution={data.distribution}
                          selected={selectedScore}
                          onSelect={setSelectedScore}
                        />
                      </Suspense>
                      <p className="report-chart-selection" role="status">
                        {bin &&
                          m.learn_insights_bin({
                            score: number(bin.score),
                            total: number(data.questionCount),
                            count: number(bin.count),
                          })}
                      </p>
                      <p className="activity-note">
                        {m.learn_insights_selection_hint()}
                      </p>
                      <details className="session-help">
                        <summary>{m.learn_insights_all_scores()}</summary>
                        <dl className="learning-insights-score-list">
                          {data.distribution.map((row) => (
                            <div key={row.score}>
                              <dt>
                                {m.learn_insights_score({
                                  score: number(row.score),
                                  total: number(data.questionCount),
                                })}
                              </dt>
                              <dd>{number(row.count)}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    </div>
                  )}
                </details>
                <details className="session-help learning-insights-disclosure">
                  <summary>{m.learn_insights_question_analysis()}</summary>
                  <div className="learning-insights-body">
                    <div className="learning-field">
                      <Label htmlFor="learning-analysis-question">
                        {m.learn_insights_question()}
                      </Label>
                      <NativeSelect
                        id="learning-analysis-question"
                        value={questionIndex}
                        onChange={(e) =>
                          setQuestionIndex(Number(e.target.value))
                        }
                      >
                        {data.questions.map((q) => (
                          <NativeSelectOption key={q.index} value={q.index}>
                            {m.learn_insights_question_option({
                              number: number(q.index + 1),
                              correct: number(q.correct),
                              total: number(data.completed),
                            })}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    {question && (
                      <>
                        <h3>{question.text}</h3>
                        <p role="status">
                          {m.learn_insights_question_counts({
                            correct: number(question.correct),
                            incorrect: number(question.incorrect),
                            unanswered: number(question.unanswered),
                          })}
                        </p>
                        <ul className="learning-insights-choices">
                          {question.choices.map((choice, index) => (
                            <li key={index}>
                              <div>
                                <strong>
                                  {String.fromCharCode(65 + index)} ·{" "}
                                  {choice.text}
                                </strong>
                                {choice.correct && (
                                  <span className="live-correct-label">
                                    {m.learn_correct()}
                                  </span>
                                )}
                              </div>
                              <span>
                                {m.learn_insights_choice_count({
                                  count: number(choice.count),
                                })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </details>
              </>
            )}
            <details className="session-help learning-insights-disclosure">
              <summary>{m.learn_insights_method()}</summary>
              <div className="learning-insights-body">
                <p>{m.learn_insights_method_text()}</p>
                <p>{m.learn_insights_scope()}</p>
                {data.mode === "open" && <p>{m.learn_insights_guest_note()}</p>}
                <dl className="learning-insights-score-list">
                  <div>
                    <dt>{m.learn_insights_progress()}</dt>
                    <dd>{number(data.inProgress)}</dd>
                  </div>
                  <div>
                    <dt>{m.learn_insights_not_started()}</dt>
                    <dd>{number(data.notStarted)}</dd>
                  </div>
                  <div>
                    <dt>{m.learn_insights_revoked()}</dt>
                    <dd>{number(data.revoked)}</dd>
                  </div>
                </dl>
              </div>
            </details>
            <p className="activity-note">
              {m.learn_insights_updated({
                date: new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: org.timezone,
                }).format(new Date(data.generatedAt)),
              })}{" "}
              · {org.timezone}
            </p>
          </>
        )
      )}
    </section>
  );
}
