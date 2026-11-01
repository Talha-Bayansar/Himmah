import { useEffect, useState, useRef, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  XCircle,
  Clock3,
  Flag,
  Radio,
  Lock,
} from "lucide-react";
import { QuizShell } from "../learning/QuizShell";
import { QuizArtwork } from "../learning/ParticipantPresentation";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ActionButton } from "../components/shared/action-button";
import { ListSkeleton } from "../components/shared/infinite-list";
import { directoryRequest, DirectoryError } from "../community/client";
import { ErrorNotice } from "../activities/Activities";
import { secretToken } from "../learning/contracts";
import { m } from "../paraglide/messages.js";
import {
  phaseLabel,
  playerName,
  useLiveCommand,
  LiveCommandNotice,
} from "./shared";
import type { LiveState } from "./contracts";
const normalize = (value: string) => value.replace(/[\s-]/g, "").toUpperCase();
export default function LivePlayer({ code }: { code?: string }) {
  return (
    <QuizShell>
      {code ? <PlayerRoom key={code} code={normalize(code)} /> : <CodeEntry />}
    </QuizShell>
  );
}
function CodeEntry() {
  const [code, setCode] = useState(""),
    navigate = useNavigate(),
    valid = /^[A-F0-9]{10}$/.test(normalize(code));
  return (
    <section className="participant-section">
      <div className="participant-heading" data-view="intro">
        <QuizArtwork />
        <p className="quiz-eyebrow">
          <Radio size={16} aria-hidden="true" />
          {m.live_label()}
        </p>
        <h1>{m.live_join_title()}</h1>
        <p className="participant-description">{m.live_join_intro()}</p>
      </div>
      <form
        className="participant-section"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid)
            void navigate({
              to: "/play/$code",
              params: { code: normalize(code) },
            });
        }}
      >
        <div className="learning-field">
          <Label htmlFor="live-code">{m.live_code()}</Label>
          <Input
            id="live-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={14}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby="live-code-hint"
          />
          <p id="live-code-hint" className="activity-note">
            {m.live_code_hint()}
          </p>
        </div>
        <ActionButton type="submit" disabled={!valid}>
          {m.live_continue()}
          <ArrowRight aria-hidden="true" />
        </ActionButton>
      </form>
    </section>
  );
}
function PlayerRoom({ code }: { code: string }) {
  const cache = useQueryClient(),
    [epoch] = useState(() => crypto.randomUUID()),
    key = ["live-public", code, epoch],
    [nickname, setNickname] = useState(""),
    [denied, setDenied] = useState<unknown>(null),
    valid = /^[A-F0-9]{10}$/.test(code),
    base = `/api/live/rooms/${code}`;
  const api = async <T,>(path: string, init?: RequestInit) => {
    try {
      return await directoryRequest<T>(path, init);
    } catch (e) {
      if (
        e instanceof DirectoryError &&
        ["not_found", "live_revoked", "live_expired", "forbidden"].includes(
          e.code,
        )
      ) {
        setDenied(e);
        void cache.cancelQueries({ queryKey: key });
        cache.removeQueries({ queryKey: key });
      }
      throw e;
    }
  };
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api<LiveState>(base, { signal }),
    enabled: valid && !denied,
    retry: false,
    gcTime: 0,
    refetchInterval: (q) =>
      q.state.error ||
      !q.state.data?.joined ||
      q.state.data?.state === "finished"
        ? false
        : 3000,
  });
  const command = useLiveCommand(
    (variables) => base + (variables.action === "join" ? "/join" : "/answer"),
    api,
    async () => {
      await query.refetch();
      command.reset();
    },
  );
  useEffect(
    () => () => {
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    },
    [],
  );
  const [selected, setSelected] = useState<{
    question: number;
    choice: number;
  } | null>(null);
  useEffect(() => {
    if (
      selected &&
      query.data &&
      (selected.question !== query.data.questionIndex ||
        query.data.player?.choice === selected.choice)
    )
      setSelected(null);
  }, [query.data, selected]);
  const stage = useRef<HTMLDivElement>(null),
    previousView = useRef<string | null>(null);
  const view = query.data
    ? `${query.data.joined}:${query.data.state}:${query.data.questionIndex}`
    : null;
  useEffect(() => {
    if (view === null) return;
    if (previousView.current !== null && previousView.current !== view)
      stage.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    previousView.current = view;
  }, [view]);
  const data = query.data,
    locked = command.isPending || command.isError || query.isError,
    canAnswer = data?.joined && data.state === "question" && !locked;
  const chosen =
    selected?.question === data?.questionIndex
      ? selected?.choice
      : command.variables?.action === "answer" &&
          command.variables.question === data?.questionIndex &&
          (command.isPending || command.isError)
        ? Number(command.variables.choice)
        : data?.player?.choice;
  const correct = data?.question?.correct;
  const sendAnswer = (choice: number) => {
    if (data?.player && canAnswer) {
      setSelected({ question: data.questionIndex, choice });
      command.mutate({
        key: crypto.randomUUID(),
        action: "answer",
        question: data.questionIndex,
        choice,
        version: data.version,
        revision: data.player.revision,
      });
    }
  };
  const refresh = () => {
    setSelected(null);
    command.reset();
    void query.refetch();
  };
  if (!valid)
    return <ErrorNotice error={new DirectoryError("invalid_input")} />;
  if (denied)
    return (
      <>
        <ErrorNotice error={denied} />
        <Button asChild variant="outline">
          <Link to="/play">
            <ArrowLeft aria-hidden="true" />
            {m.live_another()}
          </Link>
        </Button>
      </>
    );
  return (
    <div ref={stage} className="participant-section live-player-stage">
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && !data ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : (
        data && (
          <>
            <div
              className="participant-heading"
              data-view={data.joined ? "question" : "intro"}
            >
              <p className="quiz-eyebrow">
                <Radio size={15} aria-hidden="true" />
                {m.live_label()} · {data.code.slice(0, 5)} {data.code.slice(5)}
              </p>
              <h1>{data.title}</h1>
              {data.joined && (
                <p className="participant-description">
                  {m.live_you({
                    name: playerName(
                      data.player!.nickname,
                      data.player!.number,
                    ),
                  })}
                </p>
              )}
            </div>
            {query.isError && (
              <ErrorNotice
                error={query.error}
                retry={() => void query.refetch()}
              />
            )}
            <LiveCommandNotice command={command} refresh={refresh} />
            {!data.joined ? (
              <section className="participant-section">
                {data.state === "lobby" ? (
                  <>
                    <p>{m.live_join_rules()}</p>
                    <form
                      className="participant-section"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!locked)
                          command.mutate({
                            key: crypto.randomUUID(),
                            action: "join",
                            token: secretToken(),
                            nickname,
                          });
                      }}
                    >
                      <div className="learning-field">
                        <Label htmlFor="live-nickname">
                          {m.live_nickname()}
                        </Label>
                        <Input
                          id="live-nickname"
                          maxLength={40}
                          value={nickname}
                          onChange={(e) => setNickname(e.target.value)}
                          autoComplete="off"
                          aria-describedby="live-name-note"
                        />
                        <p id="live-name-note" className="activity-note">
                          {m.live_anonymous_hint()}
                        </p>
                      </div>
                      <ActionButton
                        pending={command.isPending}
                        disabled={locked}
                        type="submit"
                      >
                        {m.live_join()}
                        <ArrowRight aria-hidden="true" />
                      </ActionButton>
                    </form>
                  </>
                ) : (
                  <p role="status">{m.live_join_closed()}</p>
                )}
              </section>
            ) : (
              <section className="participant-section">
                {data.state === "lobby" ? (
                  <div className="live-waiting">
                    <QuizArtwork />
                    <h2>{m.live_you_are_in()}</h2>
                    <p role="status">{m.live_wait_start()}</p>
                    <p>
                      {m.live_joined_count({
                        count: String(data.participants),
                      })}
                    </p>
                  </div>
                ) : data.state === "finished" ? (
                  <div className="participant-result-summary">
                    <QuizArtwork finish />
                    <h2>{m.live_finished()}</h2>
                    {data.played ? (
                      <div
                        className="quiz-score-ring"
                        style={
                          {
                            "--quiz-score": `${Math.max(0, Math.min(100, ((data.player!.score ?? 0) / data.played) * 100))}%`,
                          } as CSSProperties
                        }
                      >
                        <strong className="learning-score">
                          {m.learn_score({
                            score: String(data.player!.score ?? 0),
                            total: String(data.played),
                          })}
                        </strong>
                      </div>
                    ) : (
                      <p>{m.live_no_questions()}</p>
                    )}
                    <p>{m.live_thanks()}</p>
                  </div>
                ) : (
                  data.question && (
                    <>
                      <div className="learning-progress">
                        <span>
                          {m.learn_progress({
                            current: String(data.questionIndex + 1),
                            total: String(data.questionCount),
                          })}
                        </span>
                        <progress
                          className="live-progress"
                          max={data.questionCount}
                          value={data.questionIndex + 1}
                          aria-label={m.learn_progress_label()}
                        />
                      </div>
                      <p className="live-phase" role="status">
                        {data.state === "question" ? (
                          <Radio aria-hidden="true" />
                        ) : data.state === "locked" ? (
                          <Lock aria-hidden="true" />
                        ) : (
                          <Flag aria-hidden="true" />
                        )}
                        {phaseLabel(data.state)}
                      </p>
                      <fieldset
                        className="learning-answer"
                        aria-busy={command.isPending}
                      >
                        <legend>{data.question.text}</legend>
                        <div className="learning-answer-options">
                          {data.question.choices.map((choice, i) => (
                            <label
                              key={`${data.questionIndex}-${i}`}
                              data-choice={i % 4}
                              data-correct={
                                data.state === "revealed" && correct === i
                              }
                            >
                              <input
                                type="radio"
                                name={`live-answer-${data.questionIndex}`}
                                value={i}
                                checked={chosen === i}
                                disabled={!canAnswer}
                                onChange={() => sendAnswer(i)}
                              />
                              <span
                                className="quiz-choice-letter"
                                aria-hidden="true"
                              >
                                {String.fromCharCode(65 + i)}
                              </span>
                              <span className="quiz-choice-text">
                                {choice}
                                {data.state === "revealed" && correct === i && (
                                  <small className="live-correct-label">
                                    {m.learn_answer_correct()}
                                  </small>
                                )}
                              </span>
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
                      {data.state === "revealed" ? (
                        <div className="participant-section">
                          <p className="live-answer-feedback">
                            {data.player!.choice === null ? (
                              <>
                                <Clock3 aria-hidden="true" />
                                {m.learn_unanswered()}
                              </>
                            ) : data.player!.choice === correct ? (
                              <>
                                <CheckCircle2 aria-hidden="true" />
                                {m.learn_answer_correct()}
                              </>
                            ) : (
                              <>
                                <XCircle aria-hidden="true" />
                                {m.learn_answer_incorrect()}
                              </>
                            )}
                          </p>
                          {data.question.explanation && (
                            <p>{data.question.explanation}</p>
                          )}
                          <p className="activity-note">{m.live_wait_next()}</p>
                        </div>
                      ) : (
                        <p className="participant-save-status" role="status">
                          {command.isPending ? (
                            m.learn_saving()
                          ) : command.isError ? (
                            m.learn_save_unconfirmed()
                          ) : data.player!.choice !== null ? (
                            <>
                              <Check size={16} aria-hidden="true" />
                              {m.learn_answer_saved()}
                            </>
                          ) : data.state === "locked" ? (
                            m.live_wait_reveal()
                          ) : (
                            m.live_choose_hint()
                          )}
                        </p>
                      )}
                    </>
                  )
                )}
              </section>
            )}
          </>
        )
      )}
      <Button asChild variant="link">
        <Link to="/play">
          <ArrowLeft aria-hidden="true" />
          {m.live_another()}
        </Link>
      </Button>
    </div>
  );
}
