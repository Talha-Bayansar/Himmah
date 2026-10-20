/* Himmah caches public static resources only, never pages, sessions or API data. */
const CACHE = "himmah-public-v2";
const CORE = [
  "/offline",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/apple-touch-icon.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) => key.startsWith("himmah-public-") && key !== CACHE,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate") {
    // No cached organizer HTML, and no offline mutation queue.
    event.respondWith(
      fetch(request).catch(
        async () => (await caches.match("/offline")) || Response.error(),
      ),
    );
    return;
  }
  if (!url.pathname.startsWith("/assets/") && !CORE.includes(url.pathname))
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (
        response.ok &&
        response.type === "basic" &&
        !response.headers.get("Cache-Control")?.includes("no-store")
      ) {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        const assets = keys.filter((key) =>
          new URL(key.url).pathname.startsWith("/assets/"),
        );
        await Promise.all(
          assets
            .slice(0, Math.max(0, assets.length - 80))
            .map((key) => cache.delete(key)),
        );
      }
      return response;
    })(),
  );
});

// Lock-screen payloads deliberately contain no names, points, notes or codes.
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload;
      try {
        payload = event.data?.json();
      } catch {
        /* Ignore malformed payload. */
      }
      const path =
        typeof payload?.url === "string" &&
        /^\/workspace\/[0-9a-f-]{36}\/notifications$/i.test(payload.url)
          ? payload.url
          : "/hub";
      const body =
        typeof payload?.body === "string" && payload.body.length < 250
          ? payload.body
          : "Himmah";
      await self.registration.showNotification("Himmah", {
        body,
        icon: "/pwa/icon-192.png",
        badge: "/pwa/icon-192.png",
        tag: "himmah-updates",
        data: { url: path },
      });
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows)
        client.postMessage({ type: "himmah-notifications" });
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const path = event.notification.data?.url;
      const destination = new URL(
        typeof path === "string" &&
          /^\/workspace\/[0-9a-f-]{36}\/notifications$/i.test(path)
          ? path
          : "/hub",
        self.location.origin,
      ).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => client.url === destination);
      if (existing) return existing.focus();
      // Do not navigate a different open window: it may contain an unfinished form.
      return self.clients.openWindow(destination);
    })(),
  );
});

// Explicit push opt-in may activate the push-capable worker without reloading forms.
self.addEventListener("message", (event) => {
  if (event.data?.type === "himmah-enable-push")
    event.waitUntil(self.skipWaiting());
});
