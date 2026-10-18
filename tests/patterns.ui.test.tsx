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
import Hub from "../src/hub/Hub";
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
  const groupPage = createRoute({
    getParentRoute: () => root,
    path: "/workspace/$organizationId/groups/$groupId",
    component: () => {
      const { organizationId, groupId } = groupPage.useParams();
      return (
        <OrganizationPortal
          workspaceId={organizationId}
          workspaceSection="groups"
          groupId={groupId}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([
      index,
      start,
      workspace,
      groupPage,
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
        /\/api\/organizations\/[^/]+\/(people|groups|staff|invitations)/.test(
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

it("keeps profile controls and organization details on settings", async () => {
  mount(OrganizationPortal);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Noor Youth/ }));
  await screen.findByRole("heading", { name: "Members" });
  expect(screen.queryByRole("combobox", { name: "Language" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(screen.queryByText(organization.timezone)).toBeNull();
  expect(screen.queryByRole("link", { name: "Workspace" })).toBeNull();
  await user.click(screen.getByRole("link", { name: "Settings" }));
  await screen.findByRole("heading", { name: "Settings" });
  expect(screen.getByText("Owner")).toBeTruthy();
  expect(screen.getByText(organization.timezone)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Staff access" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Invitations" })).toBeTruthy();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Language" }),
    "tr",
  );
  expect(screen.getByText("Sahip")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Ayarlar" })).toBeTruthy();
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

it("uses dedicated workspace pages and blocks navigation when a member form is dirty", async () => {
  const { router } = mount(OrganizationPortal);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Noor Youth/ }));
  await screen.findByRole("heading", { name: "Members" });
  expect(router.state.location.pathname).toBe(
    `/workspace/${organization.id}/members`,
  );
  expect(screen.getByRole("button", { name: "Add member" })).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "Groups" }));
  const groupsHeading = await screen.findByRole("heading", {
    name: "Groups",
  });
  expect(router.state.location.pathname).toBe(
    `/workspace/${organization.id}/groups`,
  );
  expect(document.activeElement).toBe(groupsHeading);
  expect(screen.queryByText(organization.timezone)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Create group" }));
  let dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByText(/Private roster records/)).toBeNull();
  expect(document.activeElement).toBe(
    within(dialog).getByLabelText("Display name"),
  );
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("link", { name: "Members" }));
  await user.click(await screen.findByRole("button", { name: "Add member" }));
  dialog = await screen.findByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Display name"),
    "Unfinished nickname",
  );
  // A browser Back action can navigate while a modal is open.
  void router.navigate({
    to: "/workspace/$organizationId/$section",
    params: { organizationId: organization.id, section: "staff" },
  });
  let confirmation = await screen.findByRole("alertdialog");
  await user.click(
    within(confirmation).getByRole("button", { name: "Cancel" }),
  );
  expect(router.state.location.pathname).toBe(
    `/workspace/${organization.id}/members`,
  );
  expect(
    (within(dialog).getByLabelText("Display name") as HTMLInputElement).value,
  ).toBe("Unfinished nickname");
  void router.navigate({
    to: "/workspace/$organizationId/$section",
    params: { organizationId: organization.id, section: "staff" },
  });
  confirmation = await screen.findByRole("alertdialog");
  await user.click(
    within(confirmation).getByRole("button", { name: "Discard changes" }),
  );
  await screen.findByRole("heading", { name: "Staff access" });
  expect(router.state.location.pathname).toBe(
    `/workspace/${organization.id}/staff`,
  );
  await router.history.back();
  await screen.findByRole("heading", { name: "Members" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens a successfully saved workspace without asking to discard its setup", async () => {
  let created = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/account")
        return Response.json({ user: owner });
      if (String(input) === "/api/organizations") {
        if (init?.method === "POST") {
          created = true;
          if (/\/(people|groups|staff|invitations)(\?|$)/.test(String(input)))
            return Response.json({ items: [], nextCursor: null });
          return Response.json({ organization });
        }
        return Response.json({ organizations: created ? [organization] : [] });
      }
      if (/\/(people|groups|staff|invitations)(\?|$)/.test(String(input)))
        return Response.json({ items: [], nextCursor: null });
      return Response.json({ organization });
    }),
  );
  const { router } = mount(OrganizationPortal);
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText("Organization name"),
    "Noor Youth",
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "I am authorized to create and manage this organization.",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Create organization" }));
  await screen.findByRole("heading", { name: "Members" });
  expect(router.state.location.pathname).toBe(
    `/workspace/${organization.id}/members`,
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("paginates the organization switcher and replaces the scoped directory when switching", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const other = {
    ...organization,
    id: "b2222222-2222-4222-8222-222222222222",
    name: "Other Community",
  };
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      requests.push(path);
      if (path === "/api/account") return Response.json({ user: owner });
      if (path.startsWith("/api/organizations?"))
        return Response.json({ organizations: [other], nextCursor: null });
      if (path === "/api/organizations")
        return Response.json({
          organizations: [organization],
          nextCursor: "page-two",
        });
      if (path === `/api/organizations/${organization.id}`)
        return Response.json({ organization });
      if (path === `/api/organizations/${other.id}`)
        return Response.json({ organization: other });
      const isOther = path.includes(other.id);
      return Response.json({
        items: path.includes("/groups?")
          ? [
              {
                id: "33333333-3333-4333-8333-333333333333",
                name: isOther ? "Other group" : "First group",
                version: 1,
                archived: false,
                createdAt: organization.createdAt,
              },
            ]
          : [],
        nextCursor: null,
      });
    }),
  );
  const { router } = mount(OrganizationPortal);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Noor Youth/ }));
  await user.click(await screen.findByRole("link", { name: "Groups" }));
  await screen.findByText("First group");
  await user.click(screen.getByRole("button", { name: "Switch organization" }));
  const dialog = await screen.findByRole("dialog");
  const current = within(dialog).getByRole("button", { name: /Noor Youth/ });
  expect((current as HTMLButtonElement).disabled).toBe(true);
  expect(current.textContent).toContain("Current organization");
  await user.click(current);
  expect(router.state.location.pathname).toBe(
    `/workspace/${organization.id}/groups`,
  );
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(within(dialog).queryByText("Other Community")).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Load more" }));
  await user.click(
    await within(dialog).findByRole("button", { name: /Other Community/ }),
  );
  await screen.findByText("Other group");
  expect(screen.queryByText("First group")).toBeNull();
  expect(router.state.location.pathname).toBe(`/workspace/${other.id}/groups`);
  expect(
    screen.getByRole("button", { name: "Switch organization" }).textContent,
  ).toContain("Other Community");
  const trigger = screen.getByRole("button", { name: "Switch organization" });
  await user.click(trigger);
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Done",
    }),
  );
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(requests).toContain("/api/organizations?cursor=page-two");
  expect(requests.some((path) => path.includes(other.id + "/groups?"))).toBe(
    true,
  );
});

it("opens group members through a real URL and restores the group on direct navigation", async () => {
  const group = {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Study Circle",
    version: 1,
    archived: false,
    createdAt: organization.createdAt,
  };
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      requests.push(path);
      if (path === "/api/account") return Response.json({ user: owner });
      if (path === "/api/organizations")
        return Response.json({ organizations: [organization] });
      if (path === `/api/organizations/${organization.id}`)
        return Response.json({ organization });
      if (path === `/api/organizations/${organization.id}/groups/${group.id}`)
        return Response.json({ item: group });
      return Response.json({
        items: path.includes("/groups?") ? [group] : [],
        nextCursor: null,
      });
    }),
  );
  const { router } = mount(OrganizationPortal);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Noor Youth/ }));
  await user.click(await screen.findByRole("link", { name: "Groups" }));
  const view = await screen.findByRole("link", { name: "View members" });
  expect(view.getAttribute("href")).toBe(
    `/workspace/${organization.id}/groups/${group.id}`,
  );
  await user.click(view);
  await screen.findByRole("heading", { name: "Study Circle" });
  expect(router.state.location.pathname).toBe(
    `/workspace/${organization.id}/groups/${group.id}`,
  );
  expect(screen.queryByRole("button", { name: "Add member" })).toBeNull();
  expect(
    requests.some(
      (path) =>
        path.includes("/people?") &&
        new URL(path, "https://himmah.example").searchParams.get("group") ===
          group.id,
    ),
  ).toBe(true);
  await router.history.back();
  await screen.findByRole("heading", { name: "Groups" });
});

it("loads a group directly and shows unavailable groups as errors instead of an empty roster", async () => {
  const groupId = "44444444-4444-4444-8444-444444444444";
  let available = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/account") return Response.json({ user: owner });
      if (path === "/api/organizations")
        return Response.json({ organizations: [organization] });
      if (path === `/api/organizations/${organization.id}`)
        return Response.json({ organization });
      if (path === `/api/organizations/${organization.id}/groups/${groupId}`)
        return available
          ? Response.json({
              item: {
                id: groupId,
                name: "Direct group",
                archived: false,
                version: 1,
                createdAt: organization.createdAt,
              },
            })
          : Response.json({ code: "not_found" }, { status: 404 });
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  const { queryClient } = mount(
    OrganizationPortal,
    `/workspace/${organization.id}/groups/${groupId}`,
  );
  await screen.findByRole("heading", { name: "Direct group" });
  available = false;
  await queryClient.invalidateQueries({
    queryKey: [
      "organization",
      owner.id,
      organization.id,
      "directory",
      "group",
      groupId,
    ],
  });
  await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: "Direct group" })).toBeNull();
});
