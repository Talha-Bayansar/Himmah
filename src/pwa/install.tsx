import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function PwaRegistration() {
  const path = useRouterState({ select: (s) => s.location.pathname }),
    locale = useLocale()?.locale;
  useEffect(() => {
    const futsal = path.startsWith("/futsal");
    document
      .querySelector('link[rel="manifest"]')
      ?.setAttribute(
        "href",
        `${futsal ? "/futsal" : ""}/manifest.${locale ?? "en"}.webmanifest`,
      );
    document
      .querySelector('link[rel="apple-touch-icon"]')
      ?.setAttribute(
        "href",
        futsal ? "/pwa/futsal/icon-180.png" : "/pwa/apple-touch-icon.png",
      );
    document
      .querySelector('meta[name="apple-mobile-web-app-title"]')
      ?.setAttribute("content", futsal ? "Himmah Futsal" : "Himmah");
    document.title = futsal ? m.futsal_title() : m.page_title();
    document
      .querySelector('link[rel="icon"][type="image/svg+xml"]')
      ?.setAttribute("href", futsal ? "/pwa/futsal/icon.svg" : "/pwa/icon.svg");
    document
      .querySelector('link[rel="icon"][type="image/png"]')
      ?.setAttribute(
        "href",
        futsal ? "/pwa/futsal/icon-32.png" : "/pwa/icon-32.png",
      );
    document
      .querySelectorAll<HTMLLinkElement>(
        'link[rel="apple-touch-startup-image"]',
      )
      .forEach((link) => {
        const path = new URL(link.href, location.origin).pathname.replace(
          "/pwa/futsal/",
          "/pwa/",
        );
        link.setAttribute(
          "href",
          futsal ? path.replace("/pwa/", "/pwa/futsal/") : path,
        );
      });
  }, [path, locale]);
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Installation is optional; never block account access when unavailable.
        });
    }
  }, []);
  return null;
}
export function InstallApp({ futsal = false }: { futsal?: boolean } = {}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [pending, setPending] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setInstalled(
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    setIos(
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setOpen(false);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    setPending(true);
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === "accepted") setOpen(false);
    } finally {
      setPending(false);
      setPrompt(null);
    }
  }
  if (installed) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download size={16} />
        {futsal ? m.arena_install() : m.install_app()}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {futsal ? m.arena_install() : m.install_title()}
            </DialogTitle>
            <DialogDescription>
              {futsal ? m.arena_install_help() : m.install_description()}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {ios ? m.install_ios() : m.install_other()}
          </p>
          {prompt && (
            <ActionButton
              pending={pending}
              onClick={() => {
                void install().catch(() => {});
              }}
            >
              {m.install_action()}
            </ActionButton>
          )}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            {m.close()}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
