import { useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { useConfirmation } from "../components/shared/confirmation";
import { DirectoryHeader } from "../components/shared/directory-layout";
import { ActionButton } from "../components/shared/action-button";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { localTime, zonedInstant } from "../activities/contracts";
import { m } from "../paraglide/messages.js";
import {
  contentInput,
  freshContent,
  type LearningItem,
  type Question,
} from "./contracts";
import { CommandError, useLearning, useLearningCommand } from "./shared";
import LearningPicker from "./LearningPicker";
import { useLocale } from "../localization/locale";
import { ItemActions } from "../components/shared/item-actions";
export default function LearningEditor({
  item,
  activity = "",
  session = "",
}: {
  item?: LearningItem;
  activity?: string;
  session?: string;
}) {
  const locale = useLocale()?.locale ?? "en";
  const { org } = useLearning(),
    navigate = useNavigate(),
    confirm = useConfirmation();
  const stepPanel = useRef<HTMLElement>(null),
    questionSelector = useRef<HTMLSelectElement>(null),
    overview = useRef<HTMLDetailsElement>(null),
    firstStepRender = useRef(true);
  const id = useRef(item?.id ?? crypto.randomUUID()).current;
  const initialVersion = useRef(item?.version).current;
  const [draft, setDraft] = useState(item?.draft ?? freshContent()),
    [activityId, setActivity] = useState(item?.activityId ?? activity),
    [sessionId, setSession] = useState(item?.sessionId ?? session),
    [activityName, setActivityName] = useState(item?.activityName ?? ""),
    [sessionName, setSessionName] = useState(item?.sessionTopic ?? ""),
    [picker, setPicker] = useState<"activities" | "sessions" | null>(null),
    [invalid, setInvalid] = useState(false);
  const [step, setStep] = useState(0),
    [questionIndex, setQuestionIndex] = useState(0);
  useEffect(() => {
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    stepPanel.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [step, questionIndex, invalid]);
  const [dates, setDates] = useState({
    opensAt: draft.opensAt ? localTime(draft.opensAt, org.timezone) : "",
    closesAt: draft.closesAt ? localTime(draft.closesAt, org.timezone) : "",
  });
  const initial = useRef(
      JSON.stringify({ draft, activityId, sessionId, dates }),
    ),
    approved = useRef(false),
    command = useLearningCommand(id);
  const dirty =
    JSON.stringify({ draft, activityId, sessionId, dates }) !== initial.current;
  const locked = command.isPending || command.uncertain;
  useBlocker({
    shouldBlockFn: async () =>
      !approved.current &&
      (command.isPending ||
        ((dirty || command.uncertain) &&
          !(await confirm({
            title: m.directory_discard(),
            description: command.uncertain
              ? m.learn_uncertain()
              : m.directory_discard_description(),
            confirmLabel: m.directory_discard(),
            destructive: true,
          })))),
    enableBeforeUnload: () => !approved.current && (dirty || command.uncertain),
  });
  const setQuestion = (i: number, q: Question) =>
    setDraft({
      ...draft,
      questions: draft.questions.map((v, n) => (n === i ? q : v)),
    });
  const move = (i: number, to: number) => {
    const questions = [...draft.questions];
    [questions[i], questions[to]] = [questions[to]!, questions[i]!];
    setDraft({ ...draft, questions });
    setQuestionIndex(to);
  };
  useEffect(() => {
    if (command.isSuccess && !approved.current) {
      approved.current = true;
      void navigate({
        to: "/workspace/$organizationId/learning/$learningId",
        params: { organizationId: org.id, learningId: id },
        search: {
          publication: "",
          tab: "participants",
          q: "",
          activity: "",
          session: "",
        },
      });
    }
  }, [command.isSuccess]);
  const steps = [
    m.learn_wizard_details(),
    m.learn_questions(),
    m.learn_wizard_access(),
    m.learn_wizard_review(),
  ];
  const placeholder = {
    text: "Check",
    choices: ["A", "B"],
    correct: 0,
    explanation: "",
  };
  const completeQuestion = (q: Question) => {
    try {
      contentInput({ ...freshContent(), title: "Check", questions: [q] });
      return true;
    } catch {
      return false;
    }
  };
  const completeDetails = () => {
    try {
      contentInput({
        ...draft,
        opensAt: "",
        closesAt: "",
        questions: [placeholder],
      });
      return true;
    } catch {
      return false;
    }
  };
  const accessContent = () => ({
    ...draft,
    opensAt: dates.opensAt ? zonedInstant(dates.opensAt, org.timezone) : "",
    closesAt: dates.closesAt ? zonedInstant(dates.closesAt, org.timezone) : "",
  });
  const completeAccess = () => {
    try {
      contentInput({
        ...accessContent(),
        title: "Check",
        description: "",
        questions: [placeholder],
      });
      return true;
    } catch {
      return false;
    }
  };
  const completed = draft.questions.filter(completeQuestion).length;
  const validSteps = [
    completeDetails(),
    completed === draft.questions.length,
    completeAccess(),
  ];
  const jump = (next: number) => {
    if (!locked) {
      setInvalid(false);
      setStep(next);
    }
  };
  const selectQuestion = (i: number) => {
    setQuestionIndex(i);
    setInvalid(false);
  };
  const addQuestion = (copy = false) => {
    if (locked || draft.questions.length >= 50) return;
    const questions = [...draft.questions],
      at = copy ? questionIndex + 1 : questions.length;
    const source = draft.questions[questionIndex]!;
    questions.splice(
      at,
      0,
      copy
        ? { ...source, choices: [...source.choices] }
        : { text: "", choices: ["", ""], correct: 0, explanation: "" },
    );
    setDraft({ ...draft, questions });
    selectQuestion(at);
  };
  const removeQuestion = async () => {
    if (locked || draft.questions.length === 1) return;
    const q = draft.questions[questionIndex]!;
    if (
      (q.text.trim() ||
        q.choices.some((v) => v.trim()) ||
        q.explanation.trim()) &&
      !(await confirm({
        title: m.learn_remove_question(),
        description: m.learn_wizard_remove_warning(),
        confirmLabel: m.learn_remove_question(),
        destructive: true,
      }))
    )
      return;
    setDraft({
      ...draft,
      questions: draft.questions.filter((_, i) => i !== questionIndex),
    });
    selectQuestion(Math.max(0, questionIndex - 1));
  };
  const validate = (part: number) => {
    if (validSteps[part]) return true;
    setStep(part);
    setInvalid(true);
    if (part === 1)
      setQuestionIndex(draft.questions.findIndex((q) => !completeQuestion(q)));
    return false;
  };
  const next = () => {
    if (validate(step)) jump(step + 1);
  };
  const reviewDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: org.timezone,
      }).format(new Date(zonedInstant(value, org.timezone)));
    } catch {
      return value;
    }
  };
  const save = async () => {
    for (let i = 0; i < 3; i++) if (!validate(i)) return;
    const content = contentInput(accessContent());
    setInvalid(false);
    try {
      await command.run({
        action: item ? "save" : "create",
        version: initialVersion,
        content,
        activity: activityId || null,
        session: sessionId || null,
      });
    } catch {}
  };
  return (
    <section className="directory form-page learning-editor">
      <Button
        variant="link"
        className="settings-back"
        onClick={() =>
          void navigate({
            to: "/workspace/$organizationId/learning",
            params: { organizationId: org.id },
            search: { q: "", activity: activityId, session: sessionId },
          })
        }
      >
        {m.form_back()}
      </Button>
      <DirectoryHeader
        title={item ? m.learn_edit() : m.learn_create()}
        description={m.learn_editor_intro()}
        autoFocus={false}
      />
      <nav
        ref={stepPanel}
        className="learning-stepper"
        aria-label={m.learn_wizard_steps()}
      >
        <ol>
          {steps.map((label, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={locked}
                aria-current={step === i ? "step" : undefined}
                aria-description={
                  i < 3
                    ? validSteps[i]
                      ? m.learn_wizard_ready()
                      : m.learn_wizard_incomplete()
                    : m.learn_wizard_review_help()
                }
                onClick={() => jump(i)}
              >
                <span className="learning-step-number" aria-hidden="true">
                  {validSteps[i] && i !== step ? <Check size={16} /> : i + 1}
                </span>
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!locked) {
            if (step === 3) void save();
            else next();
          }
        }}
      >
        <p className="activity-note learning-step-status" role="status">
          {m.learn_wizard_step({ current: String(step + 1), total: "4" })} ·{" "}
          {steps[step]}
        </p>
        {invalid && (
          <p
            className="directory-notice"
            role="alert"
            id="learning-wizard-error"
          >
            {step === 1
              ? m.learn_wizard_question_error({
                  number: String(questionIndex + 1),
                })
              : step === 2
                ? m.learn_wizard_access_error()
                : m.learn_wizard_details_error()}
          </p>
        )}
        <fieldset disabled={locked} className="learning-fields">
          {step === 0 && (
            <>
              <h2>{m.learn_wizard_details()}</h2>{" "}
              <div className="learning-field">
                <Label htmlFor="learning-title">{m.learn_title_field()}</Label>
                <Input
                  id="learning-title"
                  aria-invalid={
                    invalid && step === 0 && draft.title.trim().length < 2
                  }
                  aria-describedby={
                    invalid && step === 0 ? "learning-wizard-error" : undefined
                  }
                  required
                  minLength={2}
                  maxLength={160}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </div>
              <div className="learning-field">
                <Label htmlFor="learning-description">
                  {m.activities_description()}
                </Label>
                <Textarea
                  id="learning-description"
                  maxLength={1000}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </div>
              <details className="session-help">
                <summary>{m.learn_optional_context()}</summary>
                <div className="learning-fields">
                  <div className="learning-field">
                    <Label>{m.insights_activity()}</Label>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setPicker("activities")}
                    >
                      {activityName ||
                        (activityId
                          ? m.insights_selected_activity()
                          : m.learn_standalone())}
                    </Button>
                  </div>
                  <div className="learning-field">
                    <Label>{m.sessions_title()}</Label>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setPicker("sessions")}
                    >
                      {sessionName ||
                        (sessionId
                          ? m.learn_selected_session()
                          : m.learn_no_session())}
                    </Button>
                  </div>
                  {(activityId || sessionId) && (
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        setActivity("");
                        setSession("");
                        setActivityName("");
                        setSessionName("");
                      }}
                    >
                      {m.learn_clear_context()}
                    </Button>
                  )}
                </div>
              </details>
            </>
          )}
          {step === 2 && (
            <>
              <h2>{m.learn_wizard_access()}</h2>{" "}
              <div className="learning-field">
                <Label htmlFor="learning-mode">{m.learn_participation()}</Label>
                <NativeSelect
                  id="learning-mode"
                  value={draft.mode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      mode: e.target.value as typeof draft.mode,
                    })
                  }
                >
                  <NativeSelectOption value="assigned">
                    {m.learn_assigned()}
                  </NativeSelectOption>
                  <NativeSelectOption value="open">
                    {m.learn_open()}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="learning-field">
                <Label htmlFor="learning-release">
                  {m.learn_release_when()}
                </Label>
                <NativeSelect
                  id="learning-release"
                  value={draft.release}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      release: e.target.value as typeof draft.release,
                    })
                  }
                >
                  <NativeSelectOption value="immediate">
                    {m.learn_immediate()}
                  </NativeSelectOption>
                  <NativeSelectOption value="manual">
                    {m.learn_manual()}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <p className="activity-note">{m.learn_one_attempt()}</p>
              <div className="learning-field-pair">
                {(["opensAt", "closesAt"] as const).map((field) => (
                  <div className="learning-field" key={field}>
                    <Label htmlFor={"learning-" + field}>
                      {field === "opensAt" ? m.learn_opens() : m.learn_closes()}
                    </Label>
                    <Input
                      id={"learning-" + field}
                      type="datetime-local"
                      value={dates[field]}
                      onChange={(e) =>
                        setDates({ ...dates, [field]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="activity-note">
                {m.activities_timezone({ timezone: org.timezone })}
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <div className="learning-question-selector">
                <div className="learning-field">
                  <Label htmlFor="learning-question-select">
                    {m.learn_wizard_select()}
                  </Label>
                  <NativeSelect
                    id="learning-question-select"
                    ref={questionSelector}
                    value={String(questionIndex)}
                    onChange={(e) => selectQuestion(Number(e.target.value))}
                  >
                    {draft.questions.map((q, i) => (
                      <NativeSelectOption key={i} value={String(i)}>
                        {m.learn_question_number({ number: String(i + 1) })} ·{" "}
                        {q.text.trim().slice(0, 60) ||
                          m.learn_wizard_untitled()}{" "}
                        ·{" "}
                        {completeQuestion(q)
                          ? m.learn_wizard_ready()
                          : m.learn_wizard_incomplete()}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={draft.questions.length >= 50}
                  onClick={() => addQuestion()}
                >
                  <Plus />
                  {m.learn_add_question()}
                </Button>
              </div>
              <p className="activity-note">
                {m.learn_wizard_completion({
                  ready: String(completed),
                  total: String(draft.questions.length),
                })}
              </p>
              <details
                ref={overview}
                className="session-help learning-question-overview"
              >
                <summary>{m.learn_wizard_question_overview()}</summary>
                <ol>
                  {draft.questions.map((q, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        aria-current={questionIndex === i ? "true" : undefined}
                        disabled={locked}
                        onClick={() => {
                          selectQuestion(i);
                          if (overview.current) overview.current.open = false;
                          questionSelector.current?.focus({
                            preventScroll: true,
                          });
                        }}
                      >
                        <span>
                          {i + 1}. {q.text.trim() || m.learn_wizard_untitled()}
                        </span>
                        <small>
                          {completeQuestion(q)
                            ? m.learn_wizard_ready()
                            : m.learn_wizard_incomplete()}
                        </small>
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
              {[draft.questions[questionIndex]!].map((q) => {
                const i = questionIndex;
                return (
                  <fieldset className="learning-question" key={i}>
                    <legend className="sr-only">
                      {m.learn_question_number({ number: String(i + 1) })}
                    </legend>
                    <div className="session-heading learning-question-heading">
                      <h2>
                        {m.learn_question_number({ number: String(i + 1) })}
                      </h2>
                      <ItemActions
                        name={m.learn_question_number({
                          number: String(i + 1),
                        })}
                        disabled={locked}
                        actions={[
                          {
                            label: m.learn_wizard_duplicate(),
                            icon: Copy,
                            disabled: draft.questions.length >= 50,
                            onSelect: () => addQuestion(true),
                          },
                          {
                            label: m.learn_move_up(),
                            icon: ArrowUp,
                            disabled: i === 0,
                            onSelect: () => move(i, i - 1),
                          },
                          {
                            label: m.learn_move_down(),
                            icon: ArrowDown,
                            disabled: i === draft.questions.length - 1,
                            onSelect: () => move(i, i + 1),
                          },
                          {
                            label: m.learn_remove_question(),
                            icon: Trash2,
                            destructive: true,
                            disabled: draft.questions.length === 1,
                            onSelect: removeQuestion,
                          },
                        ]}
                      />
                    </div>
                    <div className="learning-field">
                      <Label htmlFor={`question-${i}`}>
                        {m.learn_question()}
                      </Label>
                      <Textarea
                        id={`question-${i}`}
                        aria-invalid={invalid && !q.text.trim()}
                        aria-describedby={
                          invalid ? "learning-wizard-error" : undefined
                        }
                        required
                        maxLength={500}
                        value={q.text}
                        onChange={(e) =>
                          setQuestion(i, { ...q, text: e.target.value })
                        }
                      />
                    </div>
                    <p className="activity-note">{m.learn_correct_help()}</p>
                    {q.choices.map((choice, n) => (
                      <div className="learning-choice-editor" key={n}>
                        <label className="learning-correct-target">
                          {" "}
                          <input
                            type="radio"
                            name={`correct-${i}`}
                            aria-label={m.learn_correct_option({
                              number: String(n + 1),
                            })}
                            checked={q.correct === n}
                            onChange={() =>
                              setQuestion(i, { ...q, correct: n })
                            }
                          />
                        </label>
                        <Label className="sr-only" htmlFor={`choice-${i}-${n}`}>
                          {m.learn_option_number({ number: String(n + 1) })}
                        </Label>
                        <Input
                          id={`choice-${i}-${n}`}
                          aria-invalid={invalid && !choice.trim()}
                          aria-describedby={
                            invalid ? "learning-wizard-error" : undefined
                          }
                          required
                          maxLength={300}
                          value={choice}
                          onChange={(e) =>
                            setQuestion(i, {
                              ...q,
                              choices: q.choices.map((v, k) =>
                                k === n ? e.target.value : v,
                              ),
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={m.learn_remove_option({
                            number: String(n + 1),
                          })}
                          disabled={q.choices.length <= 2}
                          onClick={() =>
                            setQuestion(i, {
                              ...q,
                              choices: q.choices.filter((_, k) => k !== n),
                              correct:
                                q.correct === n
                                  ? 0
                                  : q.correct > n
                                    ? q.correct - 1
                                    : q.correct,
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={q.choices.length >= 6}
                      onClick={() =>
                        setQuestion(i, { ...q, choices: [...q.choices, ""] })
                      }
                    >
                      {m.learn_add_option()}
                    </Button>
                    <div className="learning-field">
                      <Label htmlFor={`explanation-${i}`}>
                        {m.learn_explanation()}
                      </Label>
                      <Textarea
                        id={`explanation-${i}`}
                        maxLength={1000}
                        value={q.explanation}
                        onChange={(e) =>
                          setQuestion(i, { ...q, explanation: e.target.value })
                        }
                      />
                    </div>
                  </fieldset>
                );
              })}

              {draft.questions.length > 1 && (
                <>
                  {" "}
                  <div className="learning-question-pagination">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={questionIndex === 0}
                      onClick={() => selectQuestion(questionIndex - 1)}
                    >
                      <ArrowLeft />
                      {m.learn_wizard_previous_question()}
                    </Button>
                    <span>
                      {questionIndex + 1}/{draft.questions.length}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={questionIndex === draft.questions.length - 1}
                      onClick={() => selectQuestion(questionIndex + 1)}
                    >
                      {m.learn_wizard_next_question()}
                      <ArrowRight />
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
          {step === 3 && (
            <div className="learning-wizard-review">
              <h2>{m.learn_wizard_review()}</h2>
              <p className="activity-note">{m.learn_wizard_review_help()}</p>
              <section>
                <div className="session-heading">
                  <h3>{m.learn_wizard_details()}</h3>
                  <Button type="button" variant="ghost" onClick={() => jump(0)}>
                    <Pencil />
                    {m.learn_wizard_edit_details()}
                  </Button>
                </div>
                <h4>{draft.title.trim() || m.learn_wizard_untitled()}</h4>
                {draft.description && <p>{draft.description}</p>}
                <p className="activity-note">
                  {[
                    activityName ||
                      (activityId
                        ? m.insights_selected_activity()
                        : m.learn_standalone()),
                    sessionName ||
                      (sessionId ? m.learn_selected_session() : ""),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {!validSteps[0] && (
                  <p className="directory-notice">
                    {m.learn_wizard_details_error()}
                  </p>
                )}
              </section>
              <section>
                <div className="session-heading">
                  <h3>{m.learn_questions()}</h3>
                  <span>
                    {m.learn_wizard_completion({
                      ready: String(completed),
                      total: String(draft.questions.length),
                    })}
                  </span>
                </div>
                <ol className="learning-review-questions">
                  {draft.questions.map((q, i) => (
                    <li key={i}>
                      <div className="session-heading">
                        <strong>
                          {i + 1}. {q.text.trim() || m.learn_wizard_untitled()}
                        </strong>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={m.learn_wizard_edit_question({
                            number: String(i + 1),
                          })}
                          onClick={() => {
                            selectQuestion(i);
                            jump(1);
                          }}
                        >
                          <Pencil />
                          {m.learn_wizard_edit()}
                        </Button>
                      </div>
                      <p className="activity-note">
                        {completeQuestion(q)
                          ? `${m.learn_correct()}: ${q.choices[q.correct]}`
                          : m.learn_wizard_incomplete()}
                      </p>
                      <details className="session-help">
                        <summary>{m.learn_wizard_preview()}</summary>
                        <ul>
                          {q.choices.map((c, n) => (
                            <li key={n}>
                              {c.trim() || m.learn_wizard_incomplete()}
                              {n === q.correct ? ` · ${m.learn_correct()}` : ""}
                            </li>
                          ))}
                        </ul>
                        {q.explanation && <p>{q.explanation}</p>}
                      </details>
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <div className="session-heading">
                  <h3>{m.learn_wizard_access()}</h3>
                  <Button type="button" variant="ghost" onClick={() => jump(2)}>
                    <Pencil />
                    {m.learn_wizard_edit_access()}
                  </Button>
                </div>
                <dl className="learning-review-settings">
                  <div>
                    <dt>{m.learn_participation()}</dt>
                    <dd>
                      {draft.mode === "open"
                        ? m.learn_open()
                        : m.learn_assigned()}
                    </dd>
                  </div>
                  <div>
                    <dt>{m.learn_release_when()}</dt>
                    <dd>
                      {draft.release === "immediate"
                        ? m.learn_immediate()
                        : m.learn_manual()}
                    </dd>
                  </div>
                  <div>
                    <dt>{m.learn_opens()}</dt>
                    <dd>
                      {dates.opensAt
                        ? reviewDate(dates.opensAt)
                        : m.learn_no_opening()}
                    </dd>
                  </div>
                  <div>
                    <dt>{m.learn_closes()}</dt>
                    <dd>
                      {dates.closesAt
                        ? reviewDate(dates.closesAt)
                        : m.learn_no_deadline()}
                    </dd>
                  </div>
                </dl>
                <p className="activity-note">
                  {m.activities_timezone({ timezone: org.timezone })}
                </p>
                {!validSteps[2] && (
                  <p className="directory-notice">
                    {m.learn_wizard_access_error()}
                  </p>
                )}
              </section>
            </div>
          )}
        </fieldset>
        <CommandError command={command} />
        <div className="directory-actions learning-wizard-actions">
          <Button
            variant="outline"
            type="button"
            disabled={locked}
            onClick={() =>
              step > 0
                ? jump(step - 1)
                : void navigate({
                    to: "/workspace/$organizationId/learning",
                    params: { organizationId: org.id },
                    search: { q: "", activity: activityId, session: sessionId },
                  })
            }
          >
            {step > 0 ? m.learn_previous() : m.cancel()}
          </Button>
          <ActionButton
            type="submit"
            pending={command.isPending}
            disabled={locked}
          >
            {step === 3 ? m.learn_wizard_save() : m.learn_next()}
            {step !== 3 && <ArrowRight />}
          </ActionButton>
        </div>
      </form>
      {picker && (
        <LearningPicker
          kind={picker}
          onClose={() => setPicker(null)}
          onSelect={(v) => {
            if (picker === "activities") {
              setActivity(v.id);
              setActivityName(v.name);
              setSession("");
              setSessionName("");
            } else {
              setSession(v.id);
              setSessionName(v.name);
              setActivity(v.activityId ?? "");
              setActivityName("");
            }
            setPicker(null);
          }}
        />
      )}
    </section>
  );
}
