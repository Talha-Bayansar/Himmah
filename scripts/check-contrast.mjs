import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { JSDOM } from "jsdom";

const assets = new URL("../dist/client/assets/", import.meta.url);
const files = await readdir(assets);
const theme = await readFile(
  new URL(
    files.find((name) => /^theme-.*\.css$/.test(name)),
    assets,
  ),
  "utf8",
);
const app = await readFile(
  new URL(
    files.find((name) => /^app-.*\.css$/.test(name)),
    assets,
  ),
  "utf8",
);
const button = await readFile(
  new URL("../src/components/ui/button.tsx", import.meta.url),
  "utf8",
);
const tokens = new Map();
for (const css of [theme, app]) {
  for (const block of css.matchAll(/:root\s*\{([^{}]*)\}/g)) {
    for (const [, name, value] of block[1].matchAll(
      /(--[\w-]+)\s*:\s*([^;{}]+)/g,
    ))
      tokens.set(name, value.trim());
  }
}
// Tailwind's default theme places these tokens on :root, :host.
for (const [, name, value] of theme.matchAll(
  /(--color-(?:white|black))\s*:\s*([^;{}]+)/g,
))
  tokens.set(name, value.trim());
function resolve(value) {
  return value.replace(
    /var\((--[\w-]+)(?:,\s*([^()]+))?\)/g,
    (match, name, fallback) =>
      tokens.has(name) ? resolve(tokens.get(name)) : (fallback ?? match),
  );
}
// JSDOM has no cascade-layer engine. Restrict this audit to actual emitted button
// color utilities, with zero specificity to model their lower layer priority.
// Real unlayered app CSS is applied unchanged, so global link overrides are caught.
const utilities = new Map();
for (const [, selectors, declarations] of theme.matchAll(
  /([^{}]+)\{([^{}]*)\}/g,
)) {
  for (const selector of selectors.split(",")) {
    const match = selector.trim().match(/^\.((?:bg-|text-)[\w-]+)$/);
    if (match) utilities.set(match[1], declarations);
  }
}
const cases = [
  ["primary", "default", "a"],
  ["primary button", "default", "button"],
  ["outline", "outline", "a"],
  ["secondary", "secondary", "button"],
  ["link", "link", "a"],
  ["ghost", "ghost", "button"],
  ["destructive", "destructive", "button"],
];
function luminance(color) {
  const parts = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  assert.equal(parts?.length, 3, `Expected an RGB color: ${color}`);
  return parts
    .map((value) => value / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}
let minimum = Infinity;
for (const [label, variant, tag] of cases) {
  const match = button.match(new RegExp(`${variant}:\\s*"([^"]+)"`));
  assert.ok(match, `Missing button variant ${variant}`);
  const classes = match[1].split(/\s+/);
  const css = classes
    .filter((name) => utilities.has(name))
    .map((name) => `:where(.${name}){${utilities.get(name)}}`)
    .join("\n");
  assert.ok(
    css.includes("color:") || variant === "ghost",
    `No compiled color utility for ${variant}`,
  );
  const dom = new JSDOM(
    `<style>${resolve(css)}\n${resolve(app)}</style><${tag} data-slot="button" class="${classes.join(" ")}">Action</${tag}>`,
  );
  const element = dom.window.document.querySelector('[data-slot="button"]');
  const style = dom.window.getComputedStyle(element);
  let background = style.backgroundColor;
  if (background === "rgba(0, 0, 0, 0)")
    background = dom.window.getComputedStyle(
      dom.window.document.body,
    ).backgroundColor;
  const foregroundL = luminance(style.color),
    backgroundL = luminance(background);
  const ratio =
    (Math.max(foregroundL, backgroundL) + 0.05) /
    (Math.min(foregroundL, backgroundL) + 0.05);
  assert.ok(
    ratio >= 4.5,
    `${label}: ${style.color} on ${background} is ${ratio.toFixed(2)}:1`,
  );
  if (label === "primary") {
    const oldApp = resolve(app).replace(
      /a:not\(\[data-slot=(?:"button"|button)\]\)/g,
      "a",
    );
    const before = new JSDOM(
      `<style>${resolve(css)}\n${oldApp}</style><a data-slot="button" class="${classes.join(" ")}">Action</a>`,
    );
    const oldStyle = before.window.getComputedStyle(
      before.window.document.querySelector("a"),
    );
    const oldRatio =
      (Math.max(
        luminance(oldStyle.color),
        luminance(oldStyle.backgroundColor),
      ) +
        0.05) /
      (Math.min(
        luminance(oldStyle.color),
        luminance(oldStyle.backgroundColor),
      ) +
        0.05);
    assert.ok(
      oldRatio < 4.5,
      "Audit must reproduce the original linked-button contrast failure",
    );
    console.log(`Original link override reproduced: ${oldRatio.toFixed(2)}:1`);
    before.window.close();
  }
  minimum = Math.min(minimum, ratio);
  console.log(`${label}: ${ratio.toFixed(2)}:1`);
  dom.window.close();
}
console.log(
  `Production button color audit passed; minimum ${minimum.toFixed(2)}:1. This is a CSS audit, not a browser layout test.`,
);
