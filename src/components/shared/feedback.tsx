import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { ActionButton } from "./action-button";
import { m } from "../../paraglide/messages.js";

/** Task-local feedback; translators keep known domain errors and uncertain outcomes distinct. */
export function ErrorFeedback({
  message,
  retry,
  pending = false,
  id,
}: {
  message: ReactNode;
  retry?: (() => unknown) | undefined;
  pending?: boolean;
  id?: string;
}) {
  return (
    <div className="feedback-group">
      <div className="feedback-message" role="alert" id={id}>
        <CircleAlert aria-hidden="true" />
        <div>{message}</div>
      </div>
      {retry && (
        <ActionButton
          type="button"
          variant="outline"
          pending={pending}
          onClick={() => void retry()}
        >
          {m.try_again()}
        </ActionButton>
      )}
    </div>
  );
}
export function FieldError({
  id,
  children,
  announce = false,
}: {
  id: string;
  children?: ReactNode;
  announce?: boolean;
}) {
  return children ? (
    <p id={id} className="field-error" role={announce ? "alert" : undefined}>
      {children}
    </p>
  ) : null;
}
