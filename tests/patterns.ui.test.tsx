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
import type { WorkspaceSection } from "../src/organization/WorkspaceNavigation";
import OrganizationPortal from "../src/organization/OrganizationPortal";
import LandingPage from "../src/landing/LandingPage";
import { LocaleProvider } from "../src/localization/locale";
import { setLocale } from "../src/paraglide/runtime.js";
const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  sendVerificationOtp: vi.fn(),
  resetPassword: vi.fn(),
  signUp: vi.fn(),
}));
vi.mock("../src/organization/auth", () => ({
  authClient: () => ({
    signOut: mocks.signOut,
    signUp: { email: mocks.signUp },
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
function mount(component: () => React.ReactNode, initialEntry = "/") {
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
  const workspace = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/$section",
    component: () => {
      const { organizationId, section } = workspace.useParams();
      return (
        <OrganizationPortal
          workspaceId={organizationId}
          workspaceSection={section as WorkspaceSection}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([
      index,
      start,
      workspace,
      createRoute({
        getParentRoute: () => root,
        path: "/settings",
        component: () => <OrganizationPortal accountSettings />,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/demo",
        component: () => <p>Sample workspace</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
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
  return { queryClient, router };
}
beforeEach(() => {
  void setLocale("en", { reload: false });
  mocks.signOut.mockReset();
  mocks.signUp.mockReset().mockResolvedValue({ data: {}, error: null });
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
      if (
        /\/api\/organizations\/[^/]+\/(people|groups|staff|invitations|activities)/.test(
          String(input),
        )
      )
        return Response.json({ items: [], nextCursor: null });
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
    await user.click(await screen.findByRole("link", { name: "Your profile" }));
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Sign out of Himmah?")).toBeTruthy();
    expect(mocks.signOut).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByText("Test Organizer")).toBeTruthy();
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
    await user.click(await screen.findByRole("link", { name: "Your profile" }));
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("status", { name: "Working" })).toBeTruthy();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    complete({ data: { success: true }, error: null });
    await screen.findByText("Organizer page");
    expect(
      queryClient.getQueryData(["organizations", owner.id]),
    ).toBeUndefined();
  });
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
      name: "A home for your community.",
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
      name: "Een thuis voor jouw gemeenschap.",
    });
    expect(document.cookie).toContain("himmah_locale=nl");
    expect(document.documentElement.lang).toBe("nl");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Taal" }),
      "tr",
    );
    await screen.findByRole("heading", {
      name: "Topluluğunuz için bir yuva.",
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
    await user.click(await screen.findByRole("link", { name: "Your profile" }));
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

it("keeps a created account in verification when email delivery fails instead of inviting duplicate signup", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 401 })),
  );
  mocks.sendVerificationOtp.mockRejectedValueOnce(new Error("Network failure"));
  mount(OrganizationPortal);
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText("Your name"),
    "Community Organizer",
  );
  await user.type(
    screen.getByLabelText("Email address"),
    "organizer@example.invalid",
  );
  await user.type(screen.getByLabelText("Password"), "test-only-password-123");
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Create organizer account" }),
  );
  await screen.findByText(
    "Account created. Use Send a new code to verify your email.",
  );
  expect(
    screen.getByRole("button", { name: "Send a new verification code" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Create organizer account" }),
  ).toBeNull();
  expect(mocks.signUp).toHaveBeenCalledTimes(1);
});

it("explains thrown Neon signup errors instead of displaying a generic failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 401 })),
  );
  mocks.signUp.mockRejectedValueOnce(
    Object.assign(new Error("Provider text"), {
      code: "user_already_exists",
      status: 422,
    }),
  );
  mount(OrganizationPortal);
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText("Your name"),
    "Community Organizer",
  );
  await user.type(
    screen.getByLabelText("Email address"),
    "organizer@example.invalid",
  );
  await user.type(screen.getByLabelText("Password"), "test-only-password-123");
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Create organizer account" }),
  );
  await screen.findByText(
    "An account with this email already exists. Sign in instead.",
  );
  expect(
    (screen.getByLabelText("Email address") as HTMLInputElement).value,
  ).toBe("organizer@example.invalid");
});

it("shows translated installation guidance without claiming offline account access", async () => {
  mount(LandingPage);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Install Himmah" }),
  );
  let dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText(/An internet connection is needed/),
  ).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Language" }),
    "nl",
  );
  await user.click(screen.getByRole("button", { name: "Himmah installeren" }));
  dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText("Je gemeenschap altijd dichtbij."),
  ).toBeTruthy();
});

it("invokes the native install prompt only after the user chooses Install", async () => {
  mount(LandingPage);
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Install Himmah" });
  const prompt = vi.fn(async () => {});
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  window.dispatchEvent(event);
  await user.click(screen.getByRole("button", { name: "Install Himmah" }));
  const dialog = await screen.findByRole("dialog");
  expect(prompt).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Install app" }));
  await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
});

it("organization details reload independently, link back to Manage, and keep administration active", async () => {
  mount(OrganizationPortal, `/workspace/${organization.id}/organization`);
  await screen.findByRole("heading", { name: "Organization details" });
  expect(screen.getByText(organization.timezone)).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Manage" }).getAttribute("aria-current"),
  ).toBe("page");
  await userEvent
    .setup()
    .click(screen.getByRole("link", { name: "Back to Manage" }));
  await screen.findByRole("heading", { name: "Manage" });
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});
