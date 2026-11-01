import { QuizShell } from "./QuizShell";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ListChecks,
  CalendarClock,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ListSkeleton } from "../components/shared/infinite-list";
import {
  DirectoryError,
  directoryMessage,
  directoryRequest,
} from "../community/client";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import { secretToken, type PublicLearning } from "./contracts";
import {
  ParticipantHeading,
  ParticipantFinish,
  QuestionJourney,
} from "./ParticipantPresentation";
import { ParticipantFeedback } from "./ParticipantFeedback";
export default function Participant({ item }: { item: string }) {
  const cache = useQueryClient(),
    locale = useLocale()?.locale ?? "en",
    initialized = useRef(false),
    epoch = useRef(crypto.randomUUID()).current;
  const tokenRef = useRef<string | null>(null),
    [ready, setReady] = useState(false),
    [accessError, setAccessError] = useState<unknown>(null),
    [denied, setDenied] = useState<unknown>(null),
    [name, setName] = useState(""),
    [index, setIndex] = useState(0),
    [started, setStarted] = useState(false),
    [review, setReview] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<{
    question: number;
    choice: number;
  } | null>(null);
  const base = `/api/learning/public/${item}`,
    key = ["learning-public", item, epoch];
  const enter = async () => {
    setAccessError(null);
    try {
      const token = tokenRef.current ?? location.hash.slice(1);
      tokenRef.current = token;
      if (token) {
        history.replaceState(
          history.state,
          "",
          location.pathname + location.search,
        );
        await directoryRequest(`${base}/access`, {
          method: "POST",
          body: JSON.stringify({ token }),
        });
      }
      setReady(true);
    } catch (e) {
      setAccessError(e);
    }
  };
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void enter();
    return () => {
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    };
  }, []);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => directoryRequest<PublicLearning>(base, { signal }),
    enabled: ready && !denied,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const command = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      directoryRequest<{ id: string; revision: number }>(`${base}/command`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (saved, variables) => {
      if (variables.action === "answer") {
        cache.setQueryData<PublicLearning>(key, (old) =>
          old?.attempt && old.attempt.id === saved.id
            ? {
                ...old,
                attempt: {
                  ...old.attempt,
                  revision: saved.revision,
                  answers: {
                    ...old.attempt.answers,
                    [String(variables.question)]: Number(variables.choice),
                  },
                },
              }
            : old,
        );
      } else await query.refetch();
      if (variables.action === "start") {
        setStarted(true);
        setReview(false);
        setIndex(0);
      }
    },
  });
  const error = query.error ?? command.error;
  useEffect(() => {
    if (
      error instanceof DirectoryError &&
      ["not_found", "forbidden", "sign_in"].includes(error.code)
    ) {
      setDenied(error);
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    }
  }, [error]);
  const uncertain =
    command.isError &&
    (!(command.error instanceof DirectoryError) ||
      ![
        "invalid_input",
        "conflict",
        "learning_closed",
        "learning_attempt_limit",
      ].includes(command.error.code));
  const locked = command.isPending || command.isError;
  const run = async (body: Record<string, unknown>) => {
    try {
      await command.mutateAsync({ key: crypto.randomUUID(), ...body });
      return true;
    } catch {
      return false;
    }
  };
  const start = async () => {
    if (query.data?.attempt && !query.data.attempt.submittedAt) {
      setStarted(true);
      return;
    }
    if (await run({ action: "start", name, guestToken: secretToken() })) {
      setStarted(true);
      setReview(false);
      setIndex(0);
    }
  };
  const date = (s: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(s));
  const data = query.data,
    a = data?.attempt,
    q = data?.questions[index],
    submitted = !!a?.submittedAt;
  const view = submitted
    ? "result"
    : !started
      ? "intro"
      : review
        ? "review"
        : "question";
  const main = useRef<HTMLElement>(null),
    firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    main.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [view, index]);
  useEffect(() => {
    if (
      selectedAnswer &&
      a?.answers[selectedAnswer.question] === selectedAnswer.choice
    )
      setSelectedAnswer(null);
  }, [a?.revision, selectedAnswer]);
  return (
    <QuizShell mainRef={main}>
      {accessError || denied ? (
        <div role="alert" className="participant-message">
          <h1>{m.learn_access_error()}</h1>
          <p>{directoryMessage(accessError ?? denied)}</p>
          <p>{m.learn_access_help()}</p>
          {!!accessError && (
            <Button variant="outline" onClick={() => void enter()}>
              {m.try_again()}
            </Button>
          )}
        </div>
      ) : !ready || query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <div role="alert" className="participant-message">
          <p>{directoryMessage(query.error)}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {m.try_again()}
          </Button>
        </div>
      ) : (
        data && (
          <>
            <ParticipantHeading
              title={data.title}
              description={!started && !submitted ? data.description : ""}
              view={view}
            />
            {command.isError && (
              <div role="alert" className="participant-message">
                <p>{directoryMessage(command.error)}</p>
                {uncertain ? (
                  <>
                    <p>{m.learn_uncertain()}</p>
                    <ActionButton
                      pending={command.isPending}
                      onClick={() =>
                        command.variables && command.mutate(command.variables)
                      }
                    >
                      {m.learn_retry_save()}
                    </ActionButton>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedAnswer(null);
                      command.reset();
                      void query.refetch();
                    }}
                  >
                    {m.learn_refresh_attempt()}
                  </Button>
                )}
              </div>
            )}
            {submitted ? (
              <section className="participant-section participant-results">
                <ParticipantFinish
                  data={data}
                  date={date(a!.submittedAt!)}
                  refresh={
                    <ActionButton
                      variant="outline"
                      pending={query.isFetching}
                      onClick={() => void query.refetch()}
                    >
                      {m.learn_refresh_results()}
                    </ActionButton>
                  }
                />
                {a!.released && <ParticipantFeedback data={data} />}
                {data.available && a!.sequence < data.allowance && (
                  <div className="directory-actions participant-actions">
                    <ActionButton
                      pending={command.isPending}
                      disabled={locked}
                      onClick={() => void start()}
                    >
                      <RotateCcw aria-hidden="true" />
                      {m.learn_try_again()}
                    </ActionButton>
                  </div>
                )}
              </section>
            ) : !started ? (
              <section className="participant-section participant-intro">
                <div className="participant-facts">
                  <p>
                    <ListChecks size={18} aria-hidden="true" />
                    {m.learn_question_count({
                      count: String(
                        data.questionCount ?? data.questions.length,
                      ),
                    })}
                  </p>
                  {data.closesAt && (
                    <p>
                      <CalendarClock size={18} aria-hidden="true" />
                      <span>
                        {m.learn_deadline()}: {date(data.closesAt)}
                      </span>
                    </p>
                  )}
                  {data.opensAt && !data.available && (
                    <p>
                      <CalendarClock size={18} aria-hidden="true" />
                      <span>
                        {m.learn_opens_at()}: {date(data.opensAt)}
                      </span>
                    </p>
                  )}
                </div>
                {(data.closesAt || data.opensAt) && (
                  <p className="activity-note">
                    {m.activities_timezone({
                      timezone: new Intl.DateTimeFormat().resolvedOptions()
                        .timeZone,
                    })}
                  </p>
                )}
                {data.name ? (
                  <p className="participant-assignment">
                    {m.learn_for_name({ name: data.name })}
                  </p>
                ) : data.mode === "open" ? (
                  <div className="learning-field">
                    <Label htmlFor="participant-name">
                      {m.learn_display_name()}
                    </Label>
                    <Input
                      id="participant-name"
                      autoComplete="off"
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-describedby="participant-name-help"
                    />
                    <p className="activity-note" id="participant-name-help">
                      {m.learn_display_name_help()}
                    </p>
                  </div>
                ) : null}
                <details className="session-help participant-help">
                  <summary>{m.learn_how_it_works()}</summary>
                  <p>{m.learn_one_attempt()}</p>
                  {data.mode === "open" && <p>{m.learn_guest_warning()}</p>}
                </details>
                {!data.available && (
                  <p role="status" className="participant-notice">
                    {m.learn_not_available()}
                  </p>
                )}
                <div className="directory-actions participant-actions">
                  <ActionButton
                    pending={command.isPending}
                    disabled={
                      locked ||
                      !data.available ||
                      (!data.name && data.mode === "open" && !name.trim())
                    }
                    onClick={() => void start()}
                  >
                    {a ? m.learn_continue() : m.learn_start()}
                    <ArrowRight aria-hidden="true" />
                  </ActionButton>
                </div>
              </section>
            ) : !data.available ? (
              <p role="alert">{m.learn_not_available()}</p>
            ) : review ? (
              <section className="participant-section">
                <div className="participant-section-heading">
                  <h2>{m.learn_review()}</h2>
                  <p>
                    {m.learn_unanswered_count({
                      count: String(
                        data.questions.length -
                          Object.keys(a?.answers ?? {}).length,
                      ),
                    })}
                  </p>
                </div>
                <ol className="learning-review" role="list">
                  {data.questions.map((question, i) => (
                    <li key={i}>
                      <Button
                        variant="ghost"
                        aria-label={m.learn_edit_answer({
                          number: String(i + 1),
                        })}
                        onClick={() => {
                          setIndex(i);
                          setReview(false);
                        }}
                      >
                        <span
                          className="participant-question-number"
                          aria-hidden="true"
                        >
                          {i + 1}
                        </span>
                        <span className="participant-review-copy">
                          <strong>{question.text}</strong>
                          <span data-unanswered={a?.answers[i] === undefined}>
                            {a?.answers[i] === undefined
                              ? m.learn_unanswered()
                              : question.choices[a.answers[i]!]}
                          </span>
                        </span>
                        <Pencil size={18} aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ol>
                <p>{m.learn_submit_warning()}</p>
                <div className="directory-actions participant-actions">
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() => setReview(false)}
                  >
                    <ArrowLeft aria-hidden="true" />
                    {m.form_back()}
                  </Button>
                  <ActionButton
                    pending={command.isPending}
                    disabled={locked}
                    onClick={() =>
                      void run({
                        action: "submit",
                        attempt: a?.id,
                        revision: a?.revision,
                      })
                    }
                  >
                    {m.learn_submit()}
                  </ActionButton>
                </div>
              </section>
            ) : (
              q && (
                <section className="participant-section">
                  <div className="learning-progress">
                    <div className="participant-progress-labels">
                      <span>
                        {m.learn_progress({
                          current: String(index + 1),
                          total: String(data.questions.length),
                        })}
                      </span>
                      <span>
                        {m.learn_answered_count({
                          count: String(Object.keys(a?.answers ?? {}).length),
                          total: String(data.questions.length),
                        })}
                      </span>
                    </div>
                    <QuestionJourney data={data} index={index} />
                    <progress
                      className="sr-only"
                      max={data.questions.length}
                      value={Object.keys(a?.answers ?? {}).length}
                      aria-label={m.learn_progress_label()}
                    />
                  </div>
                  <fieldset
                    className="learning-answer"
                    aria-busy={command.isPending}
                  >
                    <legend>{q.text}</legend>
                    <div className="learning-answer-options">
                      {q.choices.map((choice, n) => (
                        <label key={n} data-choice={n % 4}>
                          <input
                            type="radio"
                            name={`answer-${index}`}
                            value={n}
                            checked={
                              selectedAnswer?.question === index
                                ? selectedAnswer.choice === n
                                : a?.answers[index] === n
                            }
                            disabled={locked}
                            onChange={() => {
                              setSelectedAnswer({
                                question: index,
                                choice: n,
                              });
                              void run({
                                action: "answer",
                                attempt: a?.id,
                                revision: a?.revision,
                                question: index,
                                choice: n,
                              });
                            }}
                          />
                          <span
                            className="quiz-choice-letter"
                            aria-hidden="true"
                          >
                            {String.fromCharCode(65 + n)}
                          </span>
                          <span className="quiz-choice-text">{choice}</span>
                          <span
                            className="quiz-choice-selected"
                            aria-hidden="true"
                          >
                            <Check size={18} />
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <p className="participant-save-status" role="status">
                    {!command.isPending &&
                      !command.isError &&
                      a?.answers[index] !== undefined && (
                        <Check size={16} aria-hidden="true" />
                      )}
                    {command.isPending
                      ? m.learn_saving()
                      : command.isError
                        ? m.learn_save_unconfirmed()
                        : a?.answers[index] !== undefined
                          ? m.learn_answer_saved()
                          : m.learn_saved()}
                  </p>
                  <div className="directory-actions participant-actions">
                    <Button
                      variant="outline"
                      disabled={locked || index === 0}
                      onClick={() => setIndex(index - 1)}
                    >
                      <ArrowLeft />
                      {m.learn_previous()}
                    </Button>
                    <Button
                      disabled={locked}
                      onClick={() =>
                        index === data.questions.length - 1
                          ? setReview(true)
                          : setIndex(index + 1)
                      }
                    >
                      {index === data.questions.length - 1
                        ? m.learn_review()
                        : m.learn_next()}
                      <ArrowRight />
                    </Button>
                  </div>
                </section>
              )
            )}
          </>
        )
      )}
    </QuizShell>
  );
}
