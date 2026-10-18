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
export function InstallApp() {
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
        {m.install_app()}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{m.install_title()}</DialogTitle>
            <DialogDescription>{m.install_description()}</DialogDescription>
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
