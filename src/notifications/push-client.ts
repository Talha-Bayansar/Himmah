import { directoryRequest, DirectoryError } from "../community/client";
export function pushSupport() {
  if (typeof window === "undefined") return { supported: false, ios: false };
  const ios =
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
    !window.matchMedia("(display-mode: standalone)").matches &&
    !(navigator as Navigator & { standalone?: boolean }).standalone;
  return {
    ios,
    supported:
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      window.isSecureContext,
  };
}
export async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  return (
    (
      await navigator.serviceWorker.getRegistration("/")
    )?.pushManager.getSubscription() ?? null
  );
}
function workerState(worker: ServiceWorker, states: ServiceWorkerState[]) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", check);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (states.includes(worker.state)) finish();
      else if (worker.state === "redundant")
        finish(new DirectoryError("push_service"));
    };
    const timer = setTimeout(
      () => finish(new DirectoryError("push_service")),
      10000,
    );
    worker.addEventListener("statechange", check);
    check();
  });
}
export async function enablePush(publicKey: string, locale: string) {
  // Request permission directly from the user's action, before other awaited work.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new DirectoryError("push_denied");
  const updated = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  if (updated.installing)
    await workerState(updated.installing, ["installed", "activated"]);
  if (updated.waiting) {
    const active = workerState(updated.waiting, ["activated"]);
    updated.waiting.postMessage({ type: "himmah-enable-push" });
    await active;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new DirectoryError("push_service")),
        10000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  const bytes = Uint8Array.from(
    atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const previous = await registration.pushManager.getSubscription();
  const subscription =
    previous ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  try {
    await directoryRequest("/api/notifications/push", {
      method: "POST",
      body: JSON.stringify({ ...subscription.toJSON(), locale }),
    });
  } catch (error) {
    if (!previous) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
}
export async function disablePush(all = false) {
  const subscription = await currentSubscription();
  let expiredSession = false;
  if (subscription || all) {
    try {
      await directoryRequest("/api/notifications/push" + (all ? "/all" : ""), {
        method: "DELETE",
        body: JSON.stringify(
          subscription ? { endpoint: subscription.endpoint } : {},
        ),
      });
    } catch (error) {
      if (all || !(error instanceof DirectoryError) || error.code !== "sign_in")
        throw error;
      // An expired session cannot revoke server rows; revoke the browser endpoint instead.
      expiredSession = true;
    }
  }
  if (subscription) {
    const removed = await subscription.unsubscribe();
    if (expiredSession && !removed) throw new DirectoryError("push_service");
  }
  const registration = await navigator.serviceWorker?.getRegistration("/");
  for (const notification of (await registration?.getNotifications()) ?? [])
    notification.close();
}
