import { it, expect, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../src/components/ui/dialog";

it("resizes the dialog with the visual viewport and reveals a keyboard-covered field", async () => {
  const viewport = new EventTarget() as EventTarget & {
    height: number;
    offsetTop: number;
  };
  viewport.height = 800;
  viewport.offsetTop = 0;
  const previous = window.visualViewport;
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  const scroll = vi.fn();
  try {
    const { unmount } = render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Test form</DialogTitle>
          <DialogDescription>Viewport fixture</DialogDescription>
          <label htmlFor="viewport-name">Name</label>
          <input id="viewport-name" />
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    const input = screen.getByLabelText("Name");
    input.scrollIntoView = scroll;
    input.getBoundingClientRect = () => ({
      top: 500,
      bottom: 548,
      left: 20,
      right: 370,
      width: 350,
      height: 48,
      x: 20,
      y: 500,
      toJSON: () => ({}),
    });
    await waitFor(() =>
      expect(dialog.style.getPropertyValue("--visible-height")).toBe("800px"),
    );
    input.focus();
    act(() => {
      viewport.height = 340;
      viewport.offsetTop = 20;
      viewport.dispatchEvent(new Event("resize"));
    });
    await waitFor(() =>
      expect(dialog.style.getPropertyValue("--visible-height")).toBe("340px"),
    );
    expect(dialog.style.getPropertyValue("--visible-top")).toBe("20px");
    await waitFor(() =>
      expect(scroll).toHaveBeenCalledWith(
        expect.objectContaining({ block: "nearest" }),
      ),
    );
    // Still inside the visual viewport, but clipped by the scrollable dialog.
    dialog.getBoundingClientRect = () => new DOMRect(0, 100, 390, 130);
    input.getBoundingClientRect = () => new DOMRect(20, 200, 350, 48);
    scroll.mockClear();
    act(() => viewport.dispatchEvent(new Event("resize")));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    unmount();
    scroll.mockClear();
    viewport.dispatchEvent(new Event("resize"));
    expect(scroll).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: previous,
    });
  }
});
