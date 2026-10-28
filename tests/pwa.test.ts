import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import sharp from "sharp";
import { splashScreens } from "../src/pwa/splash-screens.ts";

test("localized install manifests use standalone mode and valid Android/iOS icons", async () => {
  for (const locale of ["en", "nl", "tr"]) {
    const manifest = JSON.parse(
      await readFile(
        new URL(`../public/manifest.${locale}.webmanifest`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(manifest.lang, locale);
    assert.equal(manifest.id, "/");
    assert.equal(manifest.start_url, "/hub");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.background_color, "#12382f");
    assert.ok(
      manifest.icons.some(
        (icon: { purpose: string }) => icon.purpose === "maskable",
      ),
    );
    for (const icon of manifest.icons) {
      const metadata = await sharp(
        new URL(`../public${icon.src}`, import.meta.url).pathname,
      ).metadata();
      assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes);
      assert.equal(metadata.hasAlpha, false);
    }
  }
  const apple = await sharp(
    new URL("../public/pwa/apple-touch-icon.png", import.meta.url).pathname,
  ).metadata();
  assert.equal(apple.width, 180);
  assert.equal(apple.height, 180);
});
test("iOS portrait and landscape startup screen dimensions match their device media queries", async () => {
  assert.equal(splashScreens.length, 44);
  for (const screen of splashScreens) {
    const width = Number(screen.media.match(/device-width: (\d+)/)![1]);
    const height = Number(screen.media.match(/device-height: (\d+)/)![1]);
    const ratio = Number(screen.media.match(/pixel-ratio: (\d+)/)![1]);
    const portrait = screen.media.includes("orientation: portrait");
    const image = await sharp(
      new URL(`../public${screen.href}`, import.meta.url).pathname,
    ).metadata();
    assert.equal(image.width, (portrait ? width : height) * ratio);
    assert.equal(image.height, (portrait ? height : width) * ratio);
  }
});
test("offline fallback supports all languages and has no cached user content", async () => {
  const html = await readFile(
    new URL("../public/offline.html", import.meta.url),
    "utf8",
  );
  for (const locale of ["en", "nl", "tr"]) {
    const catalog = JSON.parse(
      await readFile(
        new URL(`../messages/${locale}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.ok(html.includes(catalog.offline_title));
    assert.ok(html.includes(catalog.offline_description));
  }
  assert.ok(!html.includes("test-token"));
});

test("service worker never caches API calls, authenticated HTML or mutations", async () => {
  const source = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  const listeners: Record<
    string,
    (event: {
      request: { url: string; method: string; mode: string };
      respondWith: (response: Promise<Response>) => void;
    }) => void
  > = {};
  const stored = new Map<string, Response>([
    ["/offline", new Response("offline-safe-page")],
  ]);
  let networkFailure = false;
  let writes = 0;
  runInNewContext(source, {
    self: {
      location: { origin: "https://himmah.example" },
      addEventListener: (name: string, handler: (typeof listeners)[string]) => {
        listeners[name] = handler;
      },
    },
    URL,
    Response,
    fetch: async () => {
      if (networkFailure) throw Error("Offline");
      return new Response("private-workspace-html");
    },
    caches: {
      match: async (key: string) => stored.get(key),
      open: async () => ({
        match: async () => undefined,
        put: async () => {
          writes++;
        },
        keys: async () => [],
      }),
    },
  });
  function dispatch(path: string, method = "GET", mode = "cors") {
    let result: Promise<Response> | undefined;
    listeners.fetch!({
      request: { url: "https://himmah.example" + path, method, mode },
      respondWith: (promise) => {
        result = promise;
      },
    });
    return result;
  }
  assert.equal(dispatch("/api/account"), undefined);
  assert.equal(dispatch("/api/auth/sign-up/email", "POST"), undefined);
  assert.equal(dispatch("/start", "POST"), undefined);
  assert.equal(
    await (await dispatch("/start", "GET", "navigate"))!.text(),
    "private-workspace-html",
  );
  assert.equal(writes, 0);
  networkFailure = true;
  assert.equal(
    await (await dispatch("/start", "GET", "navigate"))!.text(),
    "offline-safe-page",
  );
  assert.equal(writes, 0);
});

test("push notifications validate click routes, focus the centre and preserve unfinished windows", async () => {
  const source = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  type Event = {
    data?: { json: () => unknown };
    notification: { data: { url: string }; close: () => void };
    waitUntil: (promise: Promise<unknown>) => void;
  };
  const listeners: Record<string, (event: Event) => void> = {};
  const shown: {
      title: string;
      options: { body: string; data: { url: string } };
    }[] = [],
    opened: string[] = [],
    messages: unknown[] = [];
  let focused = 0,
    closed = 0,
    exact = false;
  const destination =
    "https://himmah.example/workspace/11111111-1111-4111-8111-111111111111/notifications";
  runInNewContext(source, {
    self: {
      location: { origin: "https://himmah.example" },
      addEventListener: (name: string, handler: (event: Event) => void) => {
        listeners[name] = handler;
      },
      registration: {
        showNotification: async (
          title: string,
          options: (typeof shown)[number]["options"],
        ) => {
          shown.push({ title, options });
        },
      },
      clients: {
        matchAll: async () => [
          {
            url: exact ? destination : "https://himmah.example/workspace/form",
            focus: async () => {
              focused++;
            },
            postMessage: (value: unknown) => messages.push(value),
          },
        ],
        openWindow: async (url: string) => {
          opened.push(url);
        },
      },
    },
    URL,
    Response,
  });
  async function dispatch(
    kind: string,
    data: unknown,
    url = "https://evil.invalid/",
  ) {
    let work: Promise<unknown> | undefined;
    listeners[kind]!({
      data: { json: () => data },
      notification: {
        data: { url },
        close: () => {
          closed++;
        },
      },
      waitUntil: (p) => {
        work = p;
      },
    });
    await work;
  }
  await dispatch("push", {
    body: "Generic update",
    url: "/workspace/11111111-1111-4111-8111-111111111111/notifications",
  });
  assert.equal(shown[0]!.title, "Himmah");
  assert.equal(shown[0]!.options.body, "Generic update");
  assert.equal(messages.length, 1);
  await dispatch("notificationclick", null, shown[0]!.options.data.url);
  assert.deepEqual(opened, [destination]);
  assert.equal(focused, 0);
  exact = true;
  await dispatch("notificationclick", null, shown[0]!.options.data.url);
  assert.equal(focused, 1);
  assert.equal(opened.length, 1);
  await dispatch("notificationclick", null);
  assert.equal(opened[1], "https://himmah.example/hub");
  assert.equal(closed, 3);
  await dispatch("push", { body: "x".repeat(500), url: "//evil.invalid/" });
  assert.equal(shown[1]!.options.body, "Himmah");
  assert.equal(shown[1]!.options.data.url, "/hub");
});

test("Android notification badge has a transparent background and a white leaf silhouette", async () => {
  const { data, info } = await sharp(
    new URL("../public/pwa/notification-badge.png", import.meta.url).pathname,
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 96);
  assert.equal(info.height, 96);
  let visible = 0,
    transparent = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) transparent++;
    else {
      visible++;
      assert.equal(data[i], 255);
      assert.equal(data[i + 1], 255);
      assert.equal(data[i + 2], 255);
    }
  }
  assert.ok(visible > 200);
  assert.ok(transparent > (info.width * info.height) / 2);
  assert.equal(data[3], 0);
  const worker = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  assert.ok(worker.includes('badge: "/pwa/notification-badge.png"'));
});
