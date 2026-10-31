import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import type { PublicLearning } from "./contracts";
import { m } from "../paraglide/messages.js";

/** Render only after the server has released this attempt's answer key. */
export function ParticipantFeedback({ data }: { data: PublicLearning }) {
  const attempt = data.attempt;
  if (!attempt?.released) return null;
  return (
    <section
      className="participant-section participant-feedback"
      aria-labelledby="participant-feedback-heading"
    >
      <h2 id="participant-feedback-heading">{m.learn_feedback()}</h2>
      <ol className="participant-feedback-list" role="list">
        {data.questions.map((question, i) => {
          const answer = attempt.answers[i],
            answered = answer !== undefined;
          const hasKey =
            Number.isInteger(question.correct) &&
            question.correct! >= 0 &&
            question.correct! < question.choices.length;
          const correct = hasKey && answer === question.correct;
          const state = !answered
            ? "unanswered"
            : !hasKey
              ? "unavailable"
              : correct
                ? "correct"
                : "incorrect";
          const Icon = correct
            ? CheckCircle2
            : state === "incorrect"
              ? XCircle
              : MinusCircle;
          const status =
            state === "correct"
              ? m.learn_answer_correct()
              : state === "incorrect"
                ? m.learn_answer_incorrect()
                : state === "unanswered"
                  ? m.learn_unanswered()
                  : m.learn_feedback_unavailable();
          return (
            <li key={i}>
              <div className="participant-feedback-title">
                <span
                  className="participant-question-number"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3>{question.text}</h3>
                  <p className="participant-answer-state" data-state={state}>
                    <Icon size={16} aria-hidden="true" />
                    {status}
                  </p>
                </div>
              </div>
              <div className="participant-feedback-body">
                <dl>
                  <div>
                    <dt>{m.learn_your_answer()}</dt>
                    <dd>
                      {answered
                        ? question.choices[answer]
                        : m.learn_unanswered()}
                    </dd>
                  </div>
                  {hasKey && !correct && (
                    <div>
                      <dt>{m.learn_correct()}</dt>
                      <dd>{question.choices[question.correct!]}</dd>
                    </div>
                  )}
                </dl>
                {question.explanation && (
                  <div className="participant-explanation">
                    <h4>{m.learn_feedback_explanation()}</h4>
                    <p>{question.explanation}</p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
