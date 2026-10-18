import { useEffect, useState, type CSSProperties } from "react";

/** Mobile keyboards resize the visual viewport, which can differ from 100dvh. */
export function useVisibleViewport() {
  const [style, setStyle] = useState<CSSProperties>();
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      setStyle({
        "--visible-height": `${height}px`,
        "--visible-top": `${top}px`,
      } as CSSProperties);
    };
    const reveal = () => {
      update();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (
          !(focused instanceof HTMLElement) ||
          !focused.matches("input, textarea, select")
        )
          return;
        if (
          !focused.closest(
            '[role="dialog"], [role="alertdialog"], .onboarding-form',
          )
        )
          return;
        const rect = focused.getBoundingClientRect();
        const top = viewport?.offsetTop ?? 0;
        const bottom = top + (viewport?.height ?? window.innerHeight);
        const modal = focused.closest<HTMLElement>(
          '[role="dialog"], [role="alertdialog"]',
        );
        const modalRect = modal?.getBoundingClientRect();
        const actions = modal?.querySelector<HTMLElement>(
          ".directory-form > .directory-actions",
        );
        const visibleTop = Math.max(
          top + 16,
          modalRect ? modalRect.top + 16 : top + 16,
        );
        const visibleBottom = Math.min(
          bottom - 24,
          modalRect
            ? modalRect.bottom - 16 - (actions?.offsetHeight ?? 0)
            : bottom - 24,
        );
        if (rect.top < visibleTop || rect.bottom > visibleBottom) {
          focused.scrollIntoView?.({
            block: "nearest",
            inline: "nearest",
            behavior: "instant",
          });
        }
      });
    };
    update();
    viewport?.addEventListener("resize", reveal);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", reveal);
    document.addEventListener("focusin", reveal);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", reveal);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", reveal);
      document.removeEventListener("focusin", reveal);
    };
  }, []);
  return style;
}
