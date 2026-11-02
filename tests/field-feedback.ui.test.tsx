import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "../src/components/ui/input";
import { Textarea } from "../src/components/ui/textarea";
import { NativeSelect } from "../src/components/ui/native-select";
import { setLocale } from "../src/paraglide/runtime.js";
import { DirectoryFilters } from "../src/components/shared/directory-filters";
import { InfiniteFooter } from "../src/components/shared/infinite-list";
beforeEach(() => setLocale("en", { reload: false }));
it("associates native errors with the field, retains help and clears on correction without autofocus", async () => {
  const submit = vi.fn((e) => e.preventDefault());
  const user = userEvent.setup();
  render(
    <form onSubmit={submit}>
      <label htmlFor="email">Email</label>
      <Input id="email" type="email" required aria-describedby="help" />
      <p id="help">Use your contact address</p>
      <button>Save</button>
    </form>,
  );
  const field = screen.getByLabelText("Email");
  expect(document.activeElement).not.toBe(field);
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(submit).not.toHaveBeenCalled();
  expect(field.getAttribute("aria-invalid")).toBe("true");
  const error = document.getElementById(
    field.getAttribute("aria-errormessage")!,
  );
  expect(error?.textContent).toBe("Complete this field.");
  expect(field.getAttribute("aria-describedby")).toBe(`help ${error!.id}`);
  await user.type(field, "hello@example.test");
  expect(field.getAttribute("aria-invalid")).not.toBe("true");
  expect(field.getAttribute("aria-describedby")).toBe("help");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(submit).toHaveBeenCalledOnce();
});
it("shares native constraint feedback across textareas and selects", () => {
  render(
    <>
      <label htmlFor="notes">Notes</label>
      <Textarea id="notes" required />
      <label htmlFor="choice">Choice</label>
      <NativeSelect id="choice" required defaultValue="">
        <option value="">Choose</option>
        <option value="a">A</option>
      </NativeSelect>
    </>,
  );
  for (const name of ["Notes", "Choice"]) {
    const field = screen.getByLabelText(name);
    fireEvent.invalid(field);
    expect(
      document.getElementById(field.getAttribute("aria-errormessage")!)
        ?.textContent,
    ).toBe("Complete this field.");
    fireEvent.change(field, { target: { value: "a" } });
    expect(field.getAttribute("aria-invalid")).not.toBe("true");
  }
});
it("keeps a short list quiet and exposes recovery when a later page fails", () => {
  const next = vi.fn(async () => {});
  const { rerender } = render(
    <InfiniteFooter
      hasNextPage={false}
      isFetchingNextPage={false}
      isFetchNextPageError={false}
      fetchNextPage={next}
    />,
  );
  expect(screen.queryByRole("status")).toBeNull();
  rerender(
    <InfiniteFooter
      hasNextPage
      isFetchingNextPage={false}
      isFetchNextPageError
      fetchNextPage={next}
    />,
  );
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: /try again/i }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("opens filters without field autofocus and exposes a reset only when active", async () => {
  const user = userEvent.setup(),
    reset = vi.fn();
  render(
    <DirectoryFilters active onReset={reset}>
      <label>
        <input type="checkbox" defaultChecked />
        Archived
      </label>
    </DirectoryFilters>,
  );
  await user.click(screen.getByRole("button", { name: "Filters" }));
  expect(screen.getByRole("dialog", { name: "Filters" })).toBeTruthy();
  expect(document.activeElement).not.toBe(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(reset).toHaveBeenCalledOnce();
});

it("associates explicit form errors without repeating the form-level alert", () => {
  render(
    <>
      <p role="alert">Check the title</p>
      <label htmlFor="title">Title</label>
      <Input id="title" value="" readOnly aria-invalid />
    </>,
  );
  const field = screen.getByLabelText("Title");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(
    document.getElementById(field.getAttribute("aria-errormessage")!)
      ?.textContent,
  ).toBe("Complete this field.");
});

it("ties list completion to the current paginated result, resetting after a short search", () => {
  const next = vi.fn(async () => {});
  const props = {
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: next,
    hasNextPage: false,
  };
  const { rerender } = render(
    <InfiniteFooter {...props} data={{ pages: [{}, {}] }} />,
  );
  expect(screen.getByRole("status")).toBeTruthy();
  rerender(<InfiniteFooter {...props} data={{ pages: [{}] }} />);
  expect(screen.queryByRole("status")).toBeNull();
});
