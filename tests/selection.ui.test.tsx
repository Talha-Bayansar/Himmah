import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OptionPicker } from "../src/insights/OptionPicker";
import { setLocale } from "../src/paraglide/runtime.js";
import { PickerTrigger } from "../src/components/shared/selection-option";

beforeEach(() => {
  setLocale("en", { reload: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              { id: "activity-a", name: "Community gathering", archived: true },
            ],
            nextCursor: null,
          }),
          { headers: { "content-type": "application/json" } },
        ),
    ),
  );
});
function mount(selected = "activity-a") {
  const select = vi.fn(),
    close = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OptionPicker
        kind="activities"
        org="org-a"
        user="owner-a"
        selected={selected}
        onSelect={select}
        onClose={close}
      />
    </QueryClientProvider>,
  );
  return { select, close };
}
it("shows the current choice and archived detail without autofocus; a whole row selects once", async () => {
  const { select } = mount();
  const dialog = screen.getByRole("dialog");
  const row = await within(dialog).findByRole("button", {
    name: /Community gathering/,
  });
  expect(row.getAttribute("aria-pressed")).toBe("true");
  expect(
    within(dialog)
      .getByRole("button", { name: "All activities" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  expect(document.activeElement).not.toBe(
    within(dialog).getByRole("searchbox"),
  );
  row.focus();
  await userEvent.keyboard("{Enter}");
  expect(select).toHaveBeenCalledExactlyOnceWith(
    "activity-a",
    "Community gathering",
  );
});
it("clears the filter explicitly and leaves the choice untouched on cancel", async () => {
  const { select, close } = mount();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalledOnce();
  expect(select).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "All activities" }));
  expect(select).toHaveBeenCalledExactlyOnceWith("", "");
});
it("announces a sheet trigger's purpose and expanded state", () => {
  const click = vi.fn();
  render(
    <PickerTrigger label="Activity" open={false} onClick={click}>
      All activities
    </PickerTrigger>,
  );
  const trigger = screen.getByRole("button", { name: "Activity" });
  expect(trigger.getAttribute("aria-description")).toBe("All activities");
  expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});
