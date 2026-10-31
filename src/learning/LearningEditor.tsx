import { useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
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
export default function LearningEditor({
  item,
  activity = "",
  session = "",
}: {
  item?: LearningItem;
  activity?: string;
  session?: string;
}) {
  const { org } = useLearning(),
    navigate = useNavigate(),
    confirm = useConfirmation();
  const id = useRef(item?.id ?? crypto.randomUUID()).current;
  const initialVersion = useRef(item?.version).current;
  const [draft, setDraft] = useState(item?.draft ?? freshContent()),
    [activityId, setActivity] = useState(item?.activityId ?? activity),
    [sessionId, setSession] = useState(item?.sessionId ?? session),
    [activityName, setActivityName] = useState(item?.activityName ?? ""),
    [sessionName, setSessionName] = useState(item?.sessionTopic ?? ""),
    [picker, setPicker] = useState<"activities" | "sessions" | null>(null),
    [invalid, setInvalid] = useState(false);
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
  const save = async () => {
    let content;
    try {
      content = contentInput({
        ...draft,
        opensAt: dates.opensAt ? zonedInstant(dates.opensAt, org.timezone) : "",
        closesAt: dates.closesAt
          ? zonedInstant(dates.closesAt, org.timezone)
          : "",
      });
      setInvalid(false);
    } catch {
      setInvalid(true);
      return;
    }
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={locked} className="learning-fields">
          <div>
            <Label htmlFor="learning-title">{m.learn_title_field()}</Label>
            <Input
              id="learning-title"
              required
              minLength={2}
              maxLength={160}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div>
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
          <div>
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
          <div>
            <Label htmlFor="learning-release">{m.learn_release_when()}</Label>
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
              <div key={field}>
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
          <details className="session-help">
            <summary>{m.learn_optional_context()}</summary>
            <div className="learning-fields">
              <div>
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
              <div>
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
          <div className="session-heading">
            <h2>{m.learn_questions()}</h2>
            <span>{draft.questions.length}/50</span>
          </div>
          {draft.questions.map((q, i) => (
            <fieldset className="learning-question" key={i}>
              <legend>
                {m.learn_question_number({ number: String(i + 1) })}
              </legend>
              <div className="learning-question-actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.learn_move_up()}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.learn_move_down()}
                  disabled={i === draft.questions.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.learn_remove_question()}
                  disabled={draft.questions.length === 1}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      questions: draft.questions.filter((_, n) => n !== i),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              <Label htmlFor={`question-${i}`}>{m.learn_question()}</Label>
              <Textarea
                id={`question-${i}`}
                required
                maxLength={500}
                value={q.text}
                onChange={(e) => setQuestion(i, { ...q, text: e.target.value })}
              />
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
                      onChange={() => setQuestion(i, { ...q, correct: n })}
                    />
                  </label>
                  <Label className="sr-only" htmlFor={`choice-${i}-${n}`}>
                    {m.learn_option_number({ number: String(n + 1) })}
                  </Label>
                  <Input
                    id={`choice-${i}-${n}`}
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
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={draft.questions.length >= 50}
            onClick={() =>
              setDraft({
                ...draft,
                questions: [
                  ...draft.questions,
                  { text: "", choices: ["", ""], correct: 0, explanation: "" },
                ],
              })
            }
          >
            <Plus />
            {m.learn_add_question()}
          </Button>
        </fieldset>
        {invalid && <p role="alert">{m.directory_invalid_input()}</p>}
        <CommandError command={command} />
        <div className="form-actions">
          <Button
            variant="outline"
            type="button"
            disabled={command.isPending}
            onClick={() =>
              void navigate({
                to: "/workspace/$organizationId/learning",
                params: { organizationId: org.id },
                search: { q: "", activity: activityId, session: sessionId },
              })
            }
          >
            {m.cancel()}
          </Button>
          <ActionButton
            type="submit"
            pending={command.isPending}
            disabled={locked}
          >
            {m.directory_save()}
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
