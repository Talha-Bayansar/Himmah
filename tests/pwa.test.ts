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
