import { useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Leaf,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Building2,
  ShieldCheck,
  LogOut,
  Plus,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ActionButton } from "@/components/shared/action-button";
import { AccountSkeleton } from "@/components/shared/page-skeleton";
import { useConfirmation } from "@/components/shared/confirmation";
import { authClient } from "./auth";
import {
  organizationSlug,
  validateOrganization,
  type Organization,
} from "./contracts";
interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw Error(body.error ?? "Please try again.");
  return body as T;
}
async function account() {
  const response = await fetch("/api/account", { credentials: "same-origin" });
  if (response.status === 401) return null;
  if (!response.ok)
    throw Error("Account services are unavailable. Please try again.");
  return ((await response.json()) as { user: User }).user;
}
const accountKey = ["account"] as const;
const orgKey = (userId: string) => ["organizations", userId] as const;
export default function OrganizationPortal() {
  const queryClient = useQueryClient();
  const confirm = useConfirmation();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const session = useQuery({
    queryKey: accountKey,
    queryFn: account,
    retry: false,
  });
  const user = session.data;
  const organizations = useQuery({
    queryKey: orgKey(user?.id ?? "signed-out"),
    queryFn: async () =>
      (await api<{ organizations: Organization[] }>("/api/organizations"))
        .organizations,
    enabled: !!user,
    retry: false,
  });
  const selected = useQuery({
    queryKey: ["organization", user?.id, selectedId],
    queryFn: async () =>
      (
        await api<{ organization: Organization }>(
          `/api/organizations/${selectedId}`,
        )
      ).organization,
    enabled: !!user && !!selectedId,
    retry: false,
  });
  const logout = useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: accountKey });
      await queryClient.cancelQueries({ queryKey: ["organizations"] });
      await queryClient.cancelQueries({ queryKey: ["organization"] });
    },
    mutationFn: async () => {
      const result = await (await authClient()).signOut();
      if (result.error)
        throw Error(result.error.message ?? "Could not sign out.");
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["organizations"] });
      queryClient.removeQueries({ queryKey: ["organization"] });
      queryClient.getMutationCache().clear();
      queryClient.setQueryData(accountKey, null);
      setSelectedId(null);
      setCreating(false);
    },
  });
  async function signOut() {
    if (
      await confirm({
        title: "Sign out of Himmah?",
        description:
          "You’ll need to sign in again to access your organization. Your saved workspaces will stay safe. Unsaved changes will be lost.",
        confirmLabel: "Sign out",
      })
    )
      logout.mutate();
  }
  const loading = session.isPending || (!!user && organizations.isPending);
  return (
    <div className="onboarding-shell">
      <aside className="onboarding-story">
        <Link to="/" className="brand">
          <div className="brand-mark">
            <Leaf size={27} />
          </div>
          <span>
            himmah<span className="brand-sub">GROW TOGETHER</span>
          </span>
        </Link>
        <div className="onboarding-story-copy">
          <div className="eyebrow">FOR THE PEOPLE WHO SHOW UP</div>
          <h1>
            A home for your
            <br />
            youth community.
          </h1>
          <p>
            Start with your organizer account and workspace. Together, we’re
            building a place for your youth community to grow.
          </p>
          <ul>
            <li>
              <CheckCircle2 size={20} />
              <span>Your organization. Your own space.</span>
            </li>
            <li>
              <CheckCircle2 size={20} />
              <span>Activities and points that fit your community.</span>
            </li>
            <li>
              <CheckCircle2 size={20} />
              <span>Connected games when you’re ready.</span>
            </li>
          </ul>
          <div className="onboarding-orbit" aria-hidden="true">
            <Leaf size={150} strokeWidth={0.8} />
            <span>✦</span>
          </div>
        </div>
        <div className="onboarding-story-footer">
          <ShieldCheck size={17} />A dedicated space for your organization.
        </div>
      </aside>
      <section className="onboarding-main">
        <header className="onboarding-top">
          <Button variant="link" asChild>
            <Link to="/demo">
              <ArrowLeft size={15} />
              Explore the demo
            </Link>
          </Button>
          {user && (
            <ActionButton
              variant="ghost"
              pending={logout.isPending}
              onClick={signOut}
            >
              <LogOut size={16} />
              Sign out
            </ActionButton>
          )}
        </header>
        <div className="onboarding-content">
          {loading ? (
            <AccountSkeleton />
          ) : session.isError ? (
            <QueryError
              message={session.error.message}
              pending={session.isFetching}
              retry={() => session.refetch()}
            />
          ) : !user ? (
            <AuthForm
              onAuthenticated={() =>
                queryClient.invalidateQueries({ queryKey: accountKey })
              }
            />
          ) : (
            <>
              <div className="account-greeting">
                <span className="avatar">
                  {user.name?.slice(0, 1).toUpperCase() || "O"}
                </span>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <span className="badge">
                  {user.emailVerified ? "Verified" : "Verify email"}
                </span>
              </div>
              {logout.isError && <ErrorAlert message={logout.error.message} />}
              {!user.emailVerified ? (
                <AuthForm
                  key={user.id}
                  verificationEmail={user.email}
                  onAuthenticated={() =>
                    queryClient.invalidateQueries({ queryKey: accountKey })
                  }
                />
              ) : organizations.isError ? (
                <QueryError
                  message={organizations.error.message}
                  pending={organizations.isFetching}
                  retry={() => organizations.refetch()}
                />
              ) : creating || (organizations.data?.length ?? 0) === 0 ? (
                <OrganizationSetup
                  canCancel={(organizations.data?.length ?? 0) > 0}
                  onCancel={() => setCreating(false)}
                  onCreated={async (org) => {
                    await queryClient.invalidateQueries({
                      queryKey: orgKey(user.id),
                    });
                    queryClient.setQueryData(
                      ["organization", user.id, org.id],
                      org,
                    );
                    setSelectedId(org.id);
                    setCreating(false);
                  }}
                />
              ) : selectedId ? (
                selected.isPending ? (
                  <AccountSkeleton />
                ) : selected.isError ? (
                  <QueryError
                    message={selected.error.message}
                    pending={selected.isFetching}
                    retry={() => selected.refetch()}
                    onBack={() => setSelectedId(null)}
                  />
                ) : selected.data ? (
                  <Workspace
                    organization={selected.data}
                    onBack={() => setSelectedId(null)}
                  />
                ) : null
              ) : (
                <>
                  <div className="eyebrow">YOUR COMMUNITIES</div>
                  <h1>A place for every organization.</h1>
                  <p className="onboarding-intro">
                    Choose a saved workspace or create a new one.
                  </p>
                  <div className="organization-list">
                    {organizations.data?.map((org) => (
                      <Button
                        variant="outline"
                        key={org.id}
                        className="organization-choice h-auto"
                        onClick={() => setSelectedId(org.id)}
                      >
                        <span className="avatar">
                          <Building2 size={20} />
                        </span>
                        <span>
                          <strong>{org.name}</strong>
                          <small>
                            {org.slug} · {org.role}
                          </small>
                        </span>
                        <ArrowRight size={18} />
                      </Button>
                    ))}
                  </div>
                  <Button
                    className="button primary full"
                    onClick={() => setCreating(true)}
                  >
                    <Plus size={17} />
                    Create another organization
                  </Button>
                </>
              )}
            </>
          )}
        </div>
        <footer className="onboarding-footer">
          <Leaf size={14} />
          Himmah · Grow together.
        </footer>
      </section>
    </div>
  );
}
function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive" role="alert" className="mb-5">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
function QueryError({
  message,
  pending,
  retry,
  onBack,
}: {
  message: string;
  pending: boolean;
  retry: () => unknown;
  onBack?: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <ErrorAlert message={message} />
        <ActionButton pending={pending} onClick={() => retry()}>
          Try again
        </ActionButton>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            Back to my organizations
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
type AuthValues = {
  name: string;
  email: string;
  password: string;
  code: string;
  adult: boolean;
};
type OrganizationValues = {
  name: string;
  slug: string;
  timezone: string;
  authorized: boolean;
};
type AuthScreen =
  "signup" | "signin" | "verify" | "recovery-request" | "recovery-reset";
function AuthForm({
  verificationEmail,
  onAuthenticated,
}: {
  verificationEmail?: string;
  onAuthenticated: () => Promise<unknown>;
}) {
  const confirm = useConfirmation();
  const [screen, setScreen] = useState<AuthScreen>(
    verificationEmail ? "verify" : "signup",
  );
  const [notice, setNotice] = useState("");
  const form = useForm({
    defaultValues: {
      name: "",
      email: verificationEmail ?? "",
      password: "",
      code: "",
      adult: false,
    },
    onSubmit: async ({ value }) => {
      if (
        screen === "recovery-reset" &&
        !(await confirm({
          title: "Replace your password?",
          description:
            "You will use the new password to sign in. Confirm to replace the current password.",
          confirmLabel: "Replace password",
        }))
      )
        return;
      await submission.mutateAsync(value).catch(() => {});
    },
  });
  const email = useStore(form.store, (s) => s.values.email);
  const submission = useMutation({
    mutationFn: async (value: AuthValues): Promise<void> => {
      setNotice("");
      if (screen === "signup") {
        if (!value.adult)
          throw Error("Confirm that you are an adult organizer.");
        const result = await (
          await authClient()
        ).signUp.email({
          email: value.email,
          password: value.password,
          name: value.name,
        });
        if (result.error)
          throw Error(result.error.message ?? "Could not create account.");
        setScreen("verify");
        const code = await (
          await authClient()
        ).emailOtp.sendVerificationOtp({
          email: value.email,
          type: "email-verification",
        });
        if (code.error) {
          setNotice(
            "Account created. Use Send a new code to verify your email.",
          );
          return;
        }
        setNotice("Check your inbox for a verification code.");
      } else if (screen === "signin") {
        const result = await (
          await authClient()
        ).signIn.email({
          email: value.email,
          password: value.password,
        });
        if (result.error)
          throw Error(result.error.message ?? "Could not sign in.");
        form.setFieldValue("password", "");
        await onAuthenticated();
      } else if (screen === "verify") {
        const result = await (
          await authClient()
        ).emailOtp.verifyEmail({
          email: value.email,
          otp: value.code,
        });
        if (result.error)
          throw Error(
            result.error.message ?? "That code could not be verified.",
          );
        if (value.password) {
          const signed = await (
            await authClient()
          ).signIn.email({
            email: value.email,
            password: value.password,
          });
          if (signed.error) {
            setScreen("signin");
            form.setFieldValue("password", "");
            setNotice("Email verified. Sign in to continue.");
            return;
          }
        }
        await onAuthenticated();
        setScreen("signin");
        form.setFieldValue("password", "");
        form.setFieldValue("code", "");
        setNotice("Email verified. Sign in if needed to continue.");
      } else if (screen === "recovery-request") {
        const result = await (
          await authClient()
        ).emailOtp.sendVerificationOtp({
          email: value.email,
          type: "forget-password",
        });
        if (result.error)
          throw Error(
            result.error.message ?? "Could not request recovery code.",
          );
        setScreen("recovery-reset");
        setNotice(
          "If your email belongs to an account, a recovery code has been sent.",
        );
      } else {
        const result = await (
          await authClient()
        ).emailOtp.resetPassword({
          email: value.email,
          otp: value.code,
          password: value.password,
        });
        if (result.error)
          throw Error(result.error.message ?? "Could not reset password.");
        setScreen("signin");
        form.setFieldValue("password", "");
        form.setFieldValue("code", "");
        setNotice("Password updated. Sign in to continue.");
      }
    },
  });
  const resend = useMutation({
    mutationFn: async () => {
      const result = await (
        await authClient()
      ).emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (result.error)
        throw Error(result.error.message ?? "Could not send code.");
      setNotice("A new verification code has been sent.");
    },
  });
  const pending = submission.isPending || resend.isPending;
  function navigate(next: AuthScreen) {
    setScreen(next);
    setNotice("");
    submission.reset();
    resend.reset();
    form.setFieldValue("password", "");
    form.setFieldValue("code", "");
  }
  const title =
    screen === "signup"
      ? "Good things start with you."
      : screen === "signin"
        ? "Welcome back."
        : screen === "verify"
          ? "One more little step."
          : "Let’s get you back in.";
  const fields = (["name", "email", "password", "code"] as const).filter(
    (name) =>
      name === "name"
        ? screen === "signup"
        : name === "password"
          ? ["signup", "signin", "recovery-reset"].includes(screen)
          : name === "code"
            ? ["verify", "recovery-reset"].includes(screen)
            : true,
  );
  return (
    <>
      <span className="badge">Himmah Hub · Early access</span>
      <div className="eyebrow mt-6">ORGANIZER ACCOUNT</div>
      <h1>{title}</h1>
      <p className="onboarding-intro">
        {screen === "signup"
          ? "Create your organizer account, then set up your organization."
          : screen === "signin"
            ? "Sign in to your saved organization workspaces."
            : screen === "verify"
              ? "Verify your email before creating an organization."
              : "Recover your account with a code sent to your email."}
      </p>
      {submission.isError && <ErrorAlert message={submission.error.message} />}{" "}
      {resend.isError && <ErrorAlert message={resend.error.message} />}{" "}
      {notice && (
        <Alert className="mb-5" role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <form
        className="onboarding-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {fields.map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <div className="mt-5">
                <Label htmlFor={`auth-${name}`}>
                  {name === "name"
                    ? "Your name"
                    : name === "email"
                      ? "Email address"
                      : name === "password"
                        ? screen === "recovery-reset"
                          ? "New password"
                          : "Password"
                        : "Email code"}
                </Label>
                <Input
                  id={`auth-${name}`}
                  name={field.name}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  required
                  disabled={
                    pending || (!!verificationEmail && name === "email")
                  }
                  type={
                    name === "password"
                      ? "password"
                      : name === "email"
                        ? "email"
                        : "text"
                  }
                  minLength={
                    name === "password" && screen !== "signin"
                      ? 12
                      : name === "code"
                        ? 6
                        : undefined
                  }
                  maxLength={
                    name === "password" ? 128 : name === "code" ? 8 : 254
                  }
                  autoComplete={
                    name === "password"
                      ? screen === "signin"
                        ? "current-password"
                        : "new-password"
                      : name === "code"
                        ? "one-time-code"
                        : name === "name"
                          ? "name"
                          : "email"
                  }
                  inputMode={
                    name === "code"
                      ? "numeric"
                      : name === "email"
                        ? "email"
                        : undefined
                  }
                  className="mt-2"
                />
              </div>
            )}
          </form.Field>
        ))}
        {screen === "signup" && (
          <form.Field name="adult">
            {(field) => (
              <div className="mt-5 flex items-start gap-2">
                <Checkbox
                  id="adult-organizer"
                  checked={field.state.value}
                  onCheckedChange={(value) =>
                    field.handleChange(value === true)
                  }
                  disabled={pending}
                />
                <Label htmlFor="adult-organizer" className="text-xs leading-5">
                  I’m an adult organizer setting up a youth organization.
                </Label>
              </div>
            )}
          </form.Field>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <ActionButton
              type="submit"
              className="button primary full"
              pending={submission.isPending || isSubmitting}
              disabled={resend.isPending}
            >
              {screen === "signup"
                ? "Create organizer account"
                : screen === "signin"
                  ? "Sign in"
                  : screen === "verify"
                    ? "Verify email"
                    : screen === "recovery-request"
                      ? "Send recovery code"
                      : "Reset password"}
              <ArrowRight size={17} />
            </ActionButton>
          )}
        </form.Subscribe>
      </form>
      <div className="auth-switches">
        {screen === "signin" ? (
          <>
            <p>
              New here?{" "}
              <Button
                variant="link"
                onClick={() => navigate("signup")}
                disabled={pending}
              >
                Create an account
              </Button>
            </p>
            <Button
              variant="link"
              disabled={pending}
              onClick={() => navigate("recovery-request")}
            >
              Forgot password?
            </Button>
            <Button
              variant="link"
              disabled={pending}
              onClick={() => navigate("verify")}
            >
              Have an unverified account?
            </Button>
          </>
        ) : screen === "signup" ? (
          <p>
            Already have an account?{" "}
            <Button
              variant="link"
              disabled={pending}
              onClick={() => navigate("signin")}
            >
              Sign in
            </Button>
          </p>
        ) : (
          <>
            {screen === "verify" && (
              <ActionButton
                variant="link"
                pending={resend.isPending}
                disabled={submission.isPending || !email}
                onClick={() => resend.mutate()}
              >
                Send a new verification code
              </ActionButton>
            )}
            {!verificationEmail && (
              <Button
                variant="link"
                disabled={pending}
                onClick={() => navigate("signin")}
              >
                Back to sign in
              </Button>
            )}
          </>
        )}
      </div>
      <p className="onboarding-disclaimer">
        Early-access organization setup only. Youth enrollment and persistent
        activity management are being built next. Use the demo to try those
        screens.
      </p>
    </>
  );
}
function OrganizationSetup({
  canCancel,
  onCancel,
  onCreated,
}: {
  canCancel: boolean;
  onCancel: () => void;
  onCreated: (organization: Organization) => Promise<void>;
}) {
  const confirm = useConfirmation();
  const creationKey = useRef("");
  const [slugEdited, setSlugEdited] = useState(false);
  const form = useForm({
    defaultValues: {
      name: "",
      slug: "",
      timezone: "Europe/Amsterdam",
      authorized: false,
    },
    onSubmit: async ({ value }) => {
      await creation.mutateAsync(value).catch(() => {});
    },
  });
  const dirty = useStore(form.store, (state) => state.isDirty);
  const creation = useMutation({
    mutationFn: async (value: OrganizationValues): Promise<Organization> => {
      if (!value.authorized)
        throw Error(
          "Confirm that you are authorized to manage this organization.",
        );
      creationKey.current ||= crypto.randomUUID();
      const input = validateOrganization({
        ...value,
        creationKey: creationKey.current,
      });
      const result = await api<{ organization: Organization }>(
        "/api/organizations",
        { method: "POST", body: JSON.stringify(input) },
      );
      return result.organization;
    },
    onSuccess: onCreated,
  });
  useBlocker({
    shouldBlockFn: async () =>
      dirty &&
      !creation.isSuccess &&
      !(await confirm({
        title: "Discard organization setup?",
        description: "Your unsaved organization details will be lost.",
        confirmLabel: "Discard setup",
        destructive: true,
      })),
    enableBeforeUnload: dirty && !creation.isSuccess,
  });
  async function cancel() {
    if (
      !dirty ||
      (await confirm({
        title: "Discard organization setup?",
        description: "Your unsaved organization details will be lost.",
        confirmLabel: "Discard setup",
        destructive: true,
      }))
    )
      onCancel();
  }
  return (
    <>
      <div className="eyebrow">YOUR ORGANIZATION</div>
      <h1>Make this space yours.</h1>
      <p className="onboarding-intro">
        Start with a name and a timezone. Your organization will have its own
        members, activities and progress.
      </p>
      {creation.isError && <ErrorAlert message={creation.error.message} />}
      <form
        className="onboarding-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <div className="mt-5">
              <Label htmlFor="organization-name">Organization name</Label>
              <Input
                id="organization-name"
                required
                minLength={2}
                maxLength={100}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  if (!slugEdited)
                    form.setFieldValue(
                      "slug",
                      organizationSlug(e.target.value),
                    );
                }}
                placeholder="e.g. Noor Mosque Youth"
                disabled={creation.isPending}
                className="mt-2"
              />
            </div>
          )}
        </form.Field>
        <form.Field name="slug">
          {(field) => (
            <div className="mt-5">
              <Label htmlFor="organization-slug">Workspace address</Label>
              <Input
                id="organization-slug"
                required
                minLength={3}
                maxLength={48}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  setSlugEdited(true);
                  field.handleChange(e.target.value.toLowerCase());
                }}
                placeholder="noor-mosque-youth"
                disabled={creation.isPending}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-2">
                A unique name: lowercase letters, numbers and hyphens.
              </p>
            </div>
          )}
        </form.Field>
        <form.Field name="timezone">
          {(field) => (
            <div className="mt-5">
              <Label htmlFor="organization-timezone">
                Organization timezone
              </Label>
              <NativeSelect
                id="organization-timezone"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                disabled={creation.isPending}
                className="w-full mt-2"
              >
                {[
                  "Europe/Amsterdam",
                  "Europe/Brussels",
                  "Europe/London",
                  "Europe/Berlin",
                  "Europe/Istanbul",
                  "Asia/Riyadh",
                  "Africa/Casablanca",
                  "America/New_York",
                  "America/Chicago",
                  "America/Toronto",
                  "Asia/Kuala_Lumpur",
                  "Australia/Sydney",
                  "UTC",
                ].map((t) => (
                  <NativeSelectOption key={t}>{t}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
        </form.Field>
        <form.Field name="authorized">
          {(field) => (
            <div className="mt-5 flex items-start gap-2">
              <Checkbox
                id="organization-authorized"
                checked={field.state.value}
                onCheckedChange={(value) => field.handleChange(value === true)}
                disabled={creation.isPending}
              />
              <Label
                htmlFor="organization-authorized"
                className="text-xs leading-5"
              >
                I am authorized to create and manage this organization.
              </Label>
            </div>
          )}
        </form.Field>
        <Alert className="mt-5">
          <AlertDescription>
            <strong>Himmah Hub · Early access</strong>
            <br />
            No payment or game license is required to create your workspace.
          </AlertDescription>
        </Alert>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <ActionButton
              type="submit"
              pending={creation.isPending || isSubmitting}
              className="button primary full"
            >
              Create organization
              <ArrowRight size={17} />
            </ActionButton>
          )}
        </form.Subscribe>
        {canCancel && (
          <Button
            type="button"
            variant="outline"
            className="button secondary full"
            disabled={creation.isPending}
            onClick={cancel}
          >
            Back to my organizations
          </Button>
        )}
      </form>
    </>
  );
}
function Workspace({
  organization,
  onBack,
}: {
  organization: Organization;
  onBack: () => void;
}) {
  return (
    <>
      <Button variant="link" onClick={onBack}>
        <ArrowLeft size={16} />
        My organizations
      </Button>
      <div className="workspace-welcome">
        <span className="workspace-monogram">
          {organization.name.slice(0, 1)}
        </span>
        <div className="eyebrow">YOUR ORGANIZATION WORKSPACE</div>
        <h1>{organization.name}</h1>
        <p className="onboarding-intro">
          Your organization is saved and stays available when you sign in again.
        </p>
      </div>
      <div className="workspace-detail-grid">
        <div>
          <Building2 size={19} />
          <span>Workspace</span>
          <strong>{organization.slug}</strong>
        </div>
        <div>
          <Clock3 size={19} />
          <span>Timezone</span>
          <strong>{organization.timezone}</strong>
        </div>
        <div>
          <ShieldCheck size={19} />
          <span>Your role</span>
          <strong>{organization.role}</strong>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <span className="badge">Coming next</span>
          <h2>Bring your community in.</h2>
          <p className="text-muted-foreground text-sm">
            Member invitations, groups, activities, attendance and points are
            the next persistent features. They are not connected to this
            workspace yet.
          </p>
          <Button variant="outline" asChild>
            <Link to="/demo">
              Explore those flows in the demo
              <ArrowRight size={17} />
            </Link>
          </Button>
        </CardContent>
      </Card>
      <p className="onboarding-disclaimer">
        No sample children, attendance or points have been added to your
        organization. The demo and this saved workspace are separate.
      </p>
    </>
  );
}
