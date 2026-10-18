import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
// JSDOM does not implement layout observers or scrolling. Real browsers do.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
window.scrollTo = vi.fn();
afterEach(() => cleanup());
