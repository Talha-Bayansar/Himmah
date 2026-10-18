import { useRef } from "react";
/** Controlled dialogs may be opened from a menu rather than a Radix Trigger. */
export function useDialogFocusRestore(
  onOpen: ((event: Event) => void) | undefined,
  onClose: ((event: Event) => void) | undefined,
) {
  const previous = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus(event: Event) {
      previous.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      onOpen?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onClose?.(event);
      if (!event.defaultPrevented && previous.current?.isConnected) {
        event.preventDefault();
        previous.current.focus({ preventScroll: true });
      }
    },
  };
}
