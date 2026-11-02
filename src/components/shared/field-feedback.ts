import { useId, useState, type AriaAttributes, type FormEvent } from "react";
import { m } from "../../paraglide/messages.js";
/** Shared inline errors for native constraints and explicit domain validation. */
export function useFieldFeedback({
  id,
  invalid,
  describedBy,
  value,
  minLength,
}: {
  id?: string | undefined;
  invalid?: AriaAttributes["aria-invalid"];
  describedBy?: string | undefined;
  value?: unknown;
  minLength?: number | undefined;
}) {
  const generated = useId();
  const errorId = `${id ?? generated}-error`;
  const [nativeError, setNativeError] = useState<string>();
  const explicit = invalid === true || invalid === "true";
  const error = explicit
    ? !String(value ?? "").trim()
      ? m.interface_required()
      : m.interface_check_field()
    : nativeError;
  return {
    error,
    announce: !explicit,
    errorId,
    invalid: error ? true : invalid,
    describedBy:
      [describedBy, error ? errorId : undefined].filter(Boolean).join(" ") ||
      undefined,
    onInvalid(
      event: FormEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) {
      event.preventDefault();
      const field = event.currentTarget;
      setNativeError(
        field.validity.valueMissing
          ? m.interface_required()
          : field.validity.tooShort && minLength
            ? m.interface_minimum_chars({ count: String(minLength) })
            : m.interface_check_field(),
      );
    },
    onChange(
      field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    ) {
      if (field.validity.valid) setNativeError(undefined);
    },
  };
}
