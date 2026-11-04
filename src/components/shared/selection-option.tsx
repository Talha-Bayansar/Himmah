import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";

/** Shared single choice row; its parent owns selection and dismissal. */
export function SelectionOption({
  selected,
  children,
  description,
  onSelect,
  disabled = false,
}: {
  selected: boolean;
  children: ReactNode;
  description?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="selection-option"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="selection-option-copy">
        <span>{children}</span>
        {description && <small>{description}</small>}
      </span>
      <span className="selection-option-indicator" aria-hidden="true">
        {selected && <Check />}
      </span>
    </Button>
  );
}

/** Same value-and-chevron anatomy as a select, opening a searchable sheet. */
export function PickerTrigger({
  label,
  open,
  onClick,
  children,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="picker-trigger"
      aria-label={label}
      aria-description={typeof children === "string" ? children : undefined}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
    >
      <span>{children}</span>
      <ChevronDown aria-hidden="true" />
    </Button>
  );
}
