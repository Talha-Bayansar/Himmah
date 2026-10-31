import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, BookOpen } from "lucide-react";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { DirectoryHeader } from "../components/shared/directory-layout";
import { ListSkeleton } from "../components/shared/infinite-list";
import {
  DirectoryError,
  directoryMessage,
  directoryRequest,
} from "../community/client";
import { LanguageSelector, useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import { secretToken, type PublicLearning } from "./contracts";
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
  useEffect(() => {
    if (
      selectedAnswer &&
      a?.answers[selectedAnswer.question] === selectedAnswer.choice
    )
      setSelectedAnswer(null);
  }, [a?.revision, selectedAnswer]);
  return (
    <div className="learning-public">
      <header className="learning-public-header">
        <span>
          <BookOpen aria-hidden="true" />
          Himmah
        </span>
        <LanguageSelector />
      </header>
      <main className="learning-public-main">
        {accessError || denied ? (
          <div role="alert">
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
          <div role="alert">
            <p>{directoryMessage(query.error)}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {m.try_again()}
            </Button>
          </div>
        ) : (
          data && (
            <>
              <DirectoryHeader
                title={data.title}
                description={!started || submitted ? data.description : ""}
                autoFocus={false}
              />
              {command.isError && (
                <div role="alert">
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
                <section className="learning-fields">
                  <h2>{m.learn_submission_saved()}</h2>
                  <p>{date(a!.submittedAt!)}</p>
                  {a!.released ? (
                    <>
                      <strong className="learning-score">
                        {m.learn_score({
                          score: String(a!.score),
                          total: String(a!.total),
                        })}
                      </strong>
                      <ol className="learning-question-preview">
                        {data.questions.map((question, i) => (
                          <li key={i}>
                            <strong>{question.text}</strong>
                            <p>
                              {a!.answers[i] === undefined
                                ? m.learn_unanswered()
                                : question.choices[a!.answers[i]!]}
                            </p>
                            <p>
                              {m.learn_correct()}:{" "}
                              {question.choices[question.correct!]}
                            </p>
                            {question.explanation && (
                              <p>{question.explanation}</p>
                            )}
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <>
                      <p>{m.learn_results_held()}</p>
                      <Button
                        variant="outline"
                        onClick={() => void query.refetch()}
                      >
                        {m.learn_refresh_results()}
                      </Button>
                    </>
                  )}
                  {data.available && a!.sequence < data.allowance && (
                    <ActionButton
                      pending={command.isPending}
                      disabled={locked}
                      onClick={() => void start()}
                    >
                      {m.learn_try_again()}
                    </ActionButton>
                  )}
                </section>
              ) : !started ? (
                <section className="learning-fields">
                  <p>
                    {m.learn_question_count({
                      count: String(
                        data.questionCount ?? data.questions.length,
                      ),
                    })}
                  </p>
                  <p>{m.learn_one_attempt()}</p>
                  {data.closesAt && (
                    <p>
                      {m.learn_closes()}: {date(data.closesAt)}
                    </p>
                  )}
                  {data.opensAt && !data.available && (
                    <p>
                      {m.learn_opens()}: {date(data.opensAt)}
                    </p>
                  )}
                  {data.name ? (
                    <p>{m.learn_for_name({ name: data.name })}</p>
                  ) : data.mode === "open" ? (
                    <>
                      <Label htmlFor="participant-name">
                        {m.learn_display_name()}
                      </Label>
                      <Input
                        id="participant-name"
                        autoComplete="off"
                        maxLength={80}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <p className="activity-note">{m.learn_guest_warning()}</p>
                    </>
                  ) : null}
                  {!data.available && (
                    <p role="status">{m.learn_not_available()}</p>
                  )}
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
                  </ActionButton>
                </section>
              ) : !data.available ? (
                <p role="alert">{m.learn_not_available()}</p>
              ) : review ? (
                <section className="learning-fields">
                  <h2>{m.learn_review()}</h2>
                  <p>
                    {m.learn_unanswered_count({
                      count: String(
                        data.questions.length -
                          Object.keys(a?.answers ?? {}).length,
                      ),
                    })}
                  </p>
                  <ol className="learning-review">
                    {data.questions.map((question, i) => (
                      <li key={i}>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setIndex(i);
                            setReview(false);
                          }}
                        >
                          <span>
                            {i + 1}. {question.text}
                          </span>
                          <span>
                            {a?.answers[i] === undefined
                              ? m.learn_unanswered()
                              : question.choices[a.answers[i]!]}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ol>
                  <p>{m.learn_submit_warning()}</p>
                  <div className="directory-actions">
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() => setReview(false)}
                    >
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
                  <section className="learning-fields">
                    <div className="learning-progress">
                      <span>
                        {m.learn_progress({
                          current: String(index + 1),
                          total: String(data.questions.length),
                        })}
                      </span>
                      <progress
                        max={data.questions.length}
                        value={Object.keys(a?.answers ?? {}).length}
                        aria-label={m.learn_progress_label()}
                      />
                    </div>
                    <fieldset className="learning-answer">
                      <legend>{q.text}</legend>
                      {q.choices.map((choice, n) => (
                        <label key={n}>
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
                              setSelectedAnswer({ question: index, choice: n });
                              void run({
                                action: "answer",
                                attempt: a?.id,
                                revision: a?.revision,
                                question: index,
                                choice: n,
                              });
                            }}
                          />
                          <span>{choice}</span>
                        </label>
                      ))}
                    </fieldset>
                    <p className="activity-note" role="status">
                      {command.isPending ? m.learn_saving() : m.learn_saved()}
                    </p>
                    <div className="directory-actions">
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
      </main>
    </div>
  );
}
