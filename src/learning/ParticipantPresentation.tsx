import type { CSSProperties, ReactNode } from "react";
import { Compass, Flag, Sparkles, CheckCircle2 } from "lucide-react";
import type { PublicLearning } from "./contracts";
import { m } from "../paraglide/messages.js";

function QuizArtwork({ finish = false }: { finish?: boolean }) {
  const Icon = finish ? Flag : Compass;
  return (
    <div className="quiz-artwork" data-finish={finish} aria-hidden="true">
      <span className="quiz-artwork-orbit" />
      <span className="quiz-artwork-emblem">
        <Icon size={42} strokeWidth={1.6} />
      </span>
      <Sparkles className="quiz-artwork-spark" size={24} />
      <span className="quiz-artwork-dot" />
      <span className="quiz-artwork-dot" />
    </div>
  );
}

export function ParticipantHeading({
  title,
  description,
  view,
}: {
  title: string;
  description: string;
  view: string;
}) {
  return (
    <div className="participant-heading" data-view={view}>
      {view === "intro" && <QuizArtwork />}
      <p className="quiz-eyebrow">
        <Sparkles size={15} aria-hidden="true" />
        {m.learn_quiz_label()}
      </p>
      <h1>{title}</h1>
      {description && <p className="participant-description">{description}</p>}
      {view === "intro" && (
        <p className="quiz-invitation">{m.learn_quiz_invitation()}</p>
      )}
    </div>
  );
}

/** A visual journey; the native progress element provides its accessible value. */
export function QuestionJourney({
  data,
  index,
}: {
  data: PublicLearning;
  index: number;
}) {
  return (
    <div className="quiz-journey" aria-hidden="true">
      {data.questions.map((_, i) => (
        <span
          key={i}
          data-current={i === index}
          data-answered={data.attempt?.answers[i] !== undefined}
        />
      ))}
    </div>
  );
}

/** Celebration acknowledges submission, never a score-dependent pass/fail result. */
export function ParticipantFinish({
  data,
  date,
  refresh,
}: {
  data: PublicLearning;
  date: string;
  refresh: ReactNode;
}) {
  const attempt = data.attempt!;
  const hasScore =
    attempt.released && attempt.score !== null && attempt.total > 0;
  const scoreStyle = hasScore
    ? ({
        "--quiz-score": `${Math.max(0, Math.min(100, (attempt.score! / attempt.total) * 100))}%`,
      } as CSSProperties)
    : undefined;
  return (
    <div className="participant-result-summary">
      <QuizArtwork finish />
      <p className="quiz-eyebrow">{m.learn_quiz_complete()}</p>
      <div className="participant-section-heading">
        <h2>
          <CheckCircle2 size={20} aria-hidden="true" />
          {m.learn_submission_saved()}
        </h2>
        <time dateTime={attempt.submittedAt!}>{date}</time>
      </div>
      {hasScore ? (
        <div className="quiz-score-ring" style={scoreStyle}>
          <strong className="learning-score">
            {m.learn_score({
              score: String(attempt.score),
              total: String(attempt.total),
            })}
          </strong>
        </div>
      ) : !attempt.released ? (
        <div className="quiz-held-result">
          <p>{m.learn_results_held()}</p>
          {refresh}
        </div>
      ) : null}
      <p className="quiz-finish-note">{m.learn_quiz_finish_note()}</p>
    </div>
  );
}
