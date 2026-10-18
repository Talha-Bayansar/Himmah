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
