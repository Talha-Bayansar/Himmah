import { useLocale } from "@/localization/locale";
import { m } from "@/paraglide/messages.js";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
export function ActionButton({
  pending = false,
  disabled,
  children,
  ...props
}: ComponentProps<typeof Button> & { pending?: boolean }) {
  useLocale();
  return (
    <Button {...props} disabled={disabled || pending} aria-busy={pending}>
      {pending && <Spinner aria-label={m.working()} />}
      {children}
    </Button>
  );
}
