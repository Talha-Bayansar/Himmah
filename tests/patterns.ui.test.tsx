import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { ConfirmationProvider } from "../src/components/shared/confirmation";
import OrganizationPortal from "../src/organization/OrganizationPortal";
import Hub from "../src/hub/Hub";
import LandingPage from "../src/landing/LandingPage";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  sendVerificationOtp: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("../src/organization/auth", () => ({
  authClient: () => ({
    signOut: mocks.signOut,
    emailOtp: {
      sendVerificationOtp: mocks.sendVerificationOtp,
      resetPassword: mocks.resetPassword,
    },
  }),
}));
const owner = {
  id: "owner-a",
  name: "Test Organizer",
  email: "owner@example.invalid",
  emailVerified: true,
};
const organization = {
  id: "b1111111-1111-4111-8111-111111111111",
  name: "Noor Youth",
  slug: "noor-youth",
  timezone: "Europe/Amsterdam",
  role: "owner",
  createdAt: "2026-10-18T00:00:00Z",
};
function mount(component: () => React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component,
  });
  const start = createRoute({
    getParentRoute: () => root,
    path: "/start",
    component: () => <p>Organizer page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([
      index,
      start,
      createRoute({
        getParentRoute: () => root,
        path: "/demo",
        component: () => <p>Sample workspace</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <ConfirmationProvider>
          <RouterProvider router={router} />
        </ConfirmationProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { queryClient };
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  mocks.signOut.mockReset();
  mocks.sendVerificationOtp
    .mockReset()
    .mockResolvedValue({ data: { success: true }, error: null });
  mocks.resetPassword
    .mockReset()
    .mockResolvedValue({ data: { success: true }, error: null });
  mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (String(input) === "/api/account")
        return Response.json({ user: owner });
      if (String(input) === "/api/organizations")
        return Response.json({ organizations: [organization] });
      return Response.json({ organization });
    }),
  );
});
describe("shared page and interaction patterns", () => {
  it("shows a page skeleton rather than a spinner during account loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    mount(OrganizationPortal);
    const loading = await screen.findByRole("status", {
      name: "Loading account",
    });
    expect(
      loading.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(3);
    expect(screen.queryByRole("status", { name: "Working" })).toBeNull();
  });
  it("requires a sign-out confirmation and preserves the session on cancel", async () => {
    mount(OrganizationPortal);
    const user = userEvent.setup();
    await screen.findByText("A place for every organization.");
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Sign out of Himmah?")).toBeTruthy();
    expect(mocks.signOut).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByText("Noor Youth")).toBeTruthy();
  });
  it("shows an interaction spinner while sign-out is pending and clears private query data", async () => {
    let complete: (value: unknown) => void = () => {};
    mocks.signOut.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { queryClient } = mount(OrganizationPortal);
    const user = userEvent.setup();
    await screen.findByText("A place for every organization.");
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("status", { name: "Working" })).toBeTruthy();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    complete({ data: { success: true }, error: null });
    await screen.findByText("Good things start with you.");
    expect(
      queryClient.getQueryData(["organizations", owner.id]),
    ).toBeUndefined();
  });
  it("confirms reset and preserves or clears submitted form data according to the decision", async () => {
    mount(Hub);
    const user = userEvent.setup();
    await screen.findByText("Salaam, Yusuf");
    await user.click(
      screen.getByRole("button", { name: "Switch to staff view" }),
    );
    await user.click(screen.getByRole("button", { name: "Give points" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByLabelText(/Yusuf A/));
    await user.type(
      within(dialog).getByLabelText("What are you recognizing?"),
      "Helped with setup",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Review awards" }),
    );
    await user.click(
      await within(dialog).findByRole("button", { name: "Confirm awards" }),
    );
    await screen.findByText("Helped with setup");
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    let confirmation = await screen.findByRole("alertdialog");
    await user.click(
      within(confirmation).getByRole("button", { name: "Cancel" }),
    );
    expect(screen.getByText("Helped with setup")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    confirmation = await screen.findByRole("alertdialog");
    await user.click(
      within(confirmation).getByRole("button", { name: "Reset demo" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Helped with setup")).toBeNull(),
    );
  });
});

it("uses TanStack Form to publish a manual-only activity without a quiz", async () => {
  mount(Hub);
  const user = userEvent.setup();
  await screen.findByText("Salaam, Yusuf");
  await user.click(
    screen.getByRole("button", { name: "Switch to staff view" }),
  );
  await user.click(screen.getByRole("button", { name: "Create activity" }));
  await user.type(screen.getByLabelText("Activity name"), "Community helpers");
  await user.type(screen.getByLabelText("Location"), "Main hall");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("radio", { name: /Manual awards only/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Publish activity" }));
  await screen.findByText(
    "Activity published in this demo. You can now check in participants.",
  );
  expect(
    screen.getByRole("heading", { name: "Community helpers" }),
  ).toBeTruthy();
});
it("guards leaving a dirty roster with the shared confirmation dialog", async () => {
  mount(Hub);
  const user = userEvent.setup();
  await screen.findByText("Salaam, Yusuf");
  await user.click(
    screen.getByRole("button", { name: "Switch to staff view" }),
  );
  await user.click(screen.getAllByRole("button", { name: "Check-in" })[0]!);
  const group = screen.getByRole("group", { name: "Attendance for Yusuf A." });
  await user.click(within(group).getByRole("button", { name: "present" }));
  await user.click(
    screen.getByRole("link", { name: "Register your organization →" }),
  );
  let dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Discard unsaved changes?")).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("1 unsaved change")).toBeTruthy();
  await user.click(
    screen.getByRole("link", { name: "Register your organization →" }),
  );
  dialog = await screen.findByRole("alertdialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Discard changes" }),
  );
  await screen.findByText("Organizer page");
});
it("requires confirmation before cancelling an activity registration", async () => {
  mount(Hub);
  const user = userEvent.setup();
  await screen.findByText("Salaam, Yusuf");
  await user.click(
    screen.getByRole("button", { name: "View Friday youth evening" }),
  );
  let dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Count me in" }));
  await user.click(
    screen.getByRole("button", { name: "View Friday youth evening" }),
  );
  dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Cancel registration" }),
  );
  let confirmation = await screen.findByRole("alertdialog");
  await user.click(
    within(confirmation).getByRole("button", { name: "Cancel" }),
  );
  expect(
    within(dialog).getByRole("button", { name: "Cancel registration" }),
  ).toBeTruthy();
  await user.click(
    within(dialog).getByRole("button", { name: "Cancel registration" }),
  );
  confirmation = await screen.findByRole("alertdialog");
  await user.click(
    within(confirmation).getByRole("button", { name: "Cancel registration" }),
  );
  await screen.findByText("Registration cancelled.");
});

it("requires confirmation before replacing a password", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "Sign in" }, { status: 401 })),
  );
  mount(OrganizationPortal);
  const user = userEvent.setup();
  await screen.findByText("Good things start with you.");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await user.click(screen.getByRole("button", { name: "Forgot password?" }));
  await user.type(
    screen.getByLabelText("Email address"),
    "owner@example.invalid",
  );
  await user.click(screen.getByRole("button", { name: "Send recovery code" }));
  await screen.findByRole("button", { name: "Reset password" });
  await user.type(screen.getByLabelText("Email code"), "123456");
  await user.type(
    screen.getByLabelText("New password"),
    "fictional-password-123",
  );
  await user.click(screen.getByRole("button", { name: "Reset password" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(mocks.resetPassword).not.toHaveBeenCalled();
  await user.click(
    within(dialog).getByRole("button", { name: "Replace password" }),
  );
  await screen.findByText("Password updated. Sign in to continue.");
  expect(mocks.resetPassword).toHaveBeenCalledTimes(1);
});

describe("public landing page", () => {
  it("links to working onboarding without demo or planned feature links", async () => {
    mount(LandingPage);
    const user = userEvent.setup();
    await screen.findByRole("heading", {
      name: "A home for your youth community.",
    });
    expect(screen.queryByText(/demo|futsal|planned add-on/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /demo/i })).toBeNull();
    await user.click(
      screen.getByRole("link", { name: "Start your organization" }),
    );
    await screen.findByText("Organizer page");
  });
  it("translates the landing page and persists the chosen language", async () => {
    mount(LandingPage);
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Language" }),
      "nl",
    );
    await screen.findByRole("heading", {
      name: "Een thuis voor jouw jongerengemeenschap.",
    });
    expect(document.cookie).toContain("himmah_locale=nl");
    expect(document.documentElement.lang).toBe("nl");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Taal" }),
      "tr",
    );
    await screen.findByRole("heading", {
      name: "Gençlik topluluğunuz için bir yuva.",
    });
    expect(
      screen.getByRole("link", { name: "Kuruluşunuzu oluşturun" }),
    ).toBeTruthy();
    expect(document.documentElement.lang).toBe("tr");
  });
  it("changes language without losing an unfinished signup form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 401 })),
    );
    mount(OrganizationPortal);
    const user = userEvent.setup();
    const name = await screen.findByLabelText("Your name");
    await user.type(name, "Volunteer Example");
    await user.type(
      screen.getByLabelText("Email address"),
      "volunteer@example.invalid",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Language" }),
      "tr",
    );
    expect((screen.getByLabelText("Adınız") as HTMLInputElement).value).toBe(
      "Volunteer Example",
    );
    expect(
      (screen.getByLabelText("E-posta adresi") as HTMLInputElement).value,
    ).toBe("volunteer@example.invalid");
    expect(
      screen.getByRole("button", { name: "Organizatör hesabı oluştur" }),
    ).toBeTruthy();
  });
  it("localizes sign-out confirmation and cancellation in Dutch", async () => {
    mount(OrganizationPortal);
    const user = userEvent.setup();
    await screen.findByText("A place for every organization.");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Language" }),
      "nl",
    );
    await user.click(screen.getByRole("button", { name: "Uitloggen" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Uitloggen bij Himmah?")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Annuleren" }));
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});

it("shows only saved organization details after opening a workspace", async () => {
  mount(OrganizationPortal);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Noor Youth/ }));
  await screen.findByRole("heading", { name: "Noor Youth" });
  expect(screen.queryByText(/coming next|demo|futsal/i)).toBeNull();
  expect(screen.getByText("Owner")).toBeTruthy();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Language" }),
    "tr",
  );
  expect(screen.getByText("Sahip")).toBeTruthy();
  expect(
    screen.getByText(
      "Kuruluşunuz kaydedildi ve yeniden giriş yaptığınızda erişilebilir olacak.",
    ),
  ).toBeTruthy();
});
