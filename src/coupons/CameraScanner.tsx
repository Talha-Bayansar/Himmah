import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";
import { Spinner } from "../components/ui/spinner";
import { Button } from "../components/ui/button";
import { m } from "../paraglide/messages.js";
export default function CameraScanner({
  onScan,
  onClose,
}: {
  onScan: (value: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    scan = useRef(onScan),
    close = useRef(onClose);
  scan.current = onScan;
  close.current = onClose;
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true,
      controls: { stop: () => void } | undefined;
    const element = video.current!;
    const stop = () => {
      controls?.stop();
      const stream = element.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      element.srcObject = null;
    };
    const hidden = () => {
      if (document.hidden) {
        active = false;
        stop();
        close.current();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (!active) return;
        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 250,
        });
        controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          element,
          (result, _error, scanner) => {
            if (result && active) {
              active = false;
              scanner.stop();
              stop();
              scan.current(result.getText());
            }
          },
        );
        if (!active) stop();
        else setReady(true);
      } catch {
        stop();
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  return (
    <section className="coupon-camera" aria-label={m.coupon_camera()}>
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label={m.coupon_camera()}
      />
      {error ? (
        <p role="alert">{m.coupon_camera_error()}</p>
      ) : (
        <p role="status">
          {!ready && <Spinner aria-label={m.working()} />}{" "}
          {m.coupon_camera_help()}
        </p>
      )}
      <Button variant="outline" onClick={onClose}>
        <CameraOff aria-hidden="true" />
        {m.coupon_stop_camera()}
      </Button>
    </section>
  );
}
