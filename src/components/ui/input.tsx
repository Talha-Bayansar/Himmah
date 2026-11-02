import { useFieldFeedback } from "../shared/field-feedback";
import { FieldError } from "../shared/feedback";
import { cn } from "@/lib/utils";
import * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const feedback = useFieldFeedback({
    id: props.id,
    invalid: props["aria-invalid"],
    describedBy: props["aria-describedby"],
    value: props.value ?? props.defaultValue,
    minLength: props.minLength,
  });
  return (
    <>
      <input
        type={type}
        data-slot="input"
        className={cn(
          "h-12 w-full min-w-0 rounded-[var(--radius-control)] border border-input bg-card px-4 py-3 text-base shadow-none transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-card file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          className,
        )}
        {...props}
        aria-invalid={feedback.invalid}
        aria-describedby={feedback.describedBy}
        aria-errormessage={feedback.error ? feedback.errorId : undefined}
        onInvalid={(event) => {
          props.onInvalid?.(event);
          feedback.onInvalid(event);
        }}
        onChange={(event) => {
          feedback.onChange(event.currentTarget);
          props.onChange?.(event);
        }}
      />
      <FieldError id={feedback.errorId} announce={feedback.announce}>
        {feedback.error}
      </FieldError>
    </>
  );
}

export { Input };
