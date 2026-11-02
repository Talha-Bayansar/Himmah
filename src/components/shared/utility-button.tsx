import type { ComponentProps } from "react";
import { ActionButton } from "./action-button";
/** Quiet square utilities share geometry; a label is required even for icon-only actions. */
export function UtilityButton(
  props: Omit<ComponentProps<typeof ActionButton>, "variant" | "size"> & {
    "aria-label": string;
  },
) {
  return (
    <ActionButton
      {...props}
      variant="ghost"
      size="icon"
      className={["utility-button", props.className].filter(Boolean).join(" ")}
    />
  );
}
