import {
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../components/shared/directory-layout";
import { ActionButton } from "@/components/shared/action-button";
import { useConfirmation } from "@/components/shared/confirmation";
import { AccountSkeleton } from "@/components/shared/page-skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useForm, useStore } from "@tanstack/react-form";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Link,
  Navigate,
  useBlocker,
  useNavigate,
} from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronRight,
  Building2,
  CircleUserRound,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Assignments from "../access/Assignments";
import Activities from "../activities/Activities";
import AcceptInvite from "../community/AcceptInvite";
import Directory from "../community/Directory";
import { InfiniteFooter } from "../components/shared/infinite-list";
import { authError, authFailure, localizedText } from "../localization/errors";
import { LanguageSelector, useLocale } from "../localization/locale";
import {
  NotificationBell,
  Notifications,
} from "../notifications/Notifications";
import { disablePush } from "../notifications/push-client";
import { m } from "../paraglide/messages.js";
import { AccountSettings } from "./AccountSettings";
import { authClient } from "./auth";
import {
  organizationSlug,
  validateOrganization,
  type Organization,
} from "./contracts";
import { Management, OrganizationDetails } from "./Management";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import {
  WorkspaceNavigation,
  type WorkspaceSection,
} from "./WorkspaceNavigation";
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
  if (!response.ok) throw Error(body.error ?? m.error_generic());
  return body as T;
}
async function account() {
  const response = await fetch("/api/account", { credentials: "same-origin" });
  if (response.status === 401) return null;
  if (!response.ok) throw Error(m.error_account_unavailable());
  return ((await response.json()) as { user: User }).user;
}
const accountKey = ["account"] as const;
const orgKey = (userId: string) => ["organizations", userId] as const;
export default function OrganizationPortal({
  initialMode = "signup",
  inviteToken = null,
  workspaceId = null,
  workspaceSection = "people",
  accountSettings = false,
  activityId = null,
  sessionId = null,
  attendance = false,
  launch = false,
  children,
}: {
  initialMode?: "signup" | "signin";
  inviteToken?: string | null;
  workspaceId?: string | null;
  workspaceSection?: WorkspaceSection;
  accountSettings?: boolean;
  activityId?: string | null;
  sessionId?: string | null;
  attendance?: boolean;
  launch?: boolean;
  children?:
    ((user: string, organization: Organization) => ReactNode) | undefined;
} = {}) {
  useLocale();
  const queryClient = useQueryClient(),
    navigate = useNavigate(),
    confirm = useConfirmation(),
    [creating, setCreating] = useState(false);
  const session = useQuery({
      queryKey: accountKey,
      queryFn: account,
      retry: false,
    }),
    user = session.data;
  const organizations = useInfiniteQuery({
    queryKey: orgKey(user?.id ?? "signed-out"),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<{ organizations: Organization[]; nextCursor?: string | null }>(
        "/api/organizations" +
          (pageParam ? "?cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled: !!user?.emailVerified,
    retry: false,
  });
  const items = organizations.data?.pages.flatMap((p) => p.organizations) ?? [];
  const selected = useQuery({
    queryKey: ["organization", user?.id, workspaceId],
    queryFn: async ({ signal }) =>
      (
        await api<{ organization: Organization }>(
          `/api/organizations/${workspaceId}`,
          { signal },
        )
      ).organization,
    enabled: !!user?.emailVerified && !!workspaceId,
    retry: false,
  });
  const openWorkspace = (id: string, role = "owner") =>
    role === "volunteer"
      ? navigate({
          to: "/workspace/$organizationId/$section",
          params: { organizationId: id, section: "activities" },
        })
      : navigate({
          to: "/workspace/$organizationId/people/contacts",
          params: { organizationId: id },
        });
  const logout = useMutation({
    mutationFn: async () => {
      await disablePush();
      const r = await (await authClient()).signOut();
      if (r.error) throw Error(authError(r.error.code, m.error_signout()));
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(accountKey, null);
      setCreating(false);
      void navigate({ to: "/start", search: { mode: "signin" } });
    },
  });
  const signOut = async () => {
    if (
      await confirm({
        title: m.sign_out_title(),
        description: m.sign_out_description(),
        confirmLabel: m.sign_out(),
      })
    )
      logout.mutate();
  };
  const launching = useRef(false);
  useEffect(() => {
    if (!launch || launching.current || session.isPending || session.isError)
      return;
    if (!user?.emailVerified) {
      launching.current = true;
      void navigate({
        to: "/start",
        search: { mode: "signin" },
        replace: true,
      });
    } else if (organizations.isSuccess) {
      launching.current = true;
      if (items.length === 1 && !organizations.hasNextPage)
        void openWorkspace(items[0]!.id, items[0]!.role);
      else void navigate({ to: "/start", replace: true });
    }
  }, [
    launch,
    session.isPending,
    session.isError,
    user,
    organizations.isSuccess,
    organizations.hasNextPage,
    items,
    navigate,
  ]);
  const content = () => {
    if (
      session.isPending ||
      (launch && !session.isError && !organizations.isError)
    )
      return <AccountSkeleton />;
    if (session.isError)
      return (
        <QueryError
          message={session.error.message}
          pending={session.isFetching}
          retry={session.refetch}
        />
      );
    if (!user)
      return (
        <AuthForm
          initialMode={initialMode}
          onAuthenticated={() =>
            queryClient.invalidateQueries({ queryKey: accountKey })
          }
        />
      );
    if (!user.emailVerified)
      return (
        <AuthForm
          verificationEmail={user.email}
          onAuthenticated={() =>
            queryClient.invalidateQueries({ queryKey: accountKey })
          }
        />
      );
    if (accountSettings)
      return (
        <AccountSettings
          user={user}
          pending={logout.isPending}
          onSignOut={() => void signOut()}
        />
      );
    if (inviteToken)
      return <AcceptInvite token={inviteToken} userId={user.id} />;
    if (workspaceId) {
      if (selected.isPending) return <AccountSkeleton />;
      if (selected.isError)
        return (
          <QueryError
            message={selected.error.message}
            pending={selected.isFetching}
            retry={selected.refetch}
            onBack={() => void navigate({ to: "/start" })}
          />
        );
      const org = selected.data;
      if (!org) return null;
      if (children) return children(user.id, org);
      if (workspaceSection === "settings")
        return (
          <AccountSettings
            user={user}
            organization={org}
            pending={logout.isPending}
            onSignOut={() => void signOut()}
          />
        );
      if (workspaceSection === "organization")
        return <OrganizationDetails organization={org} />;
      if (workspaceSection === "notifications")
        return <Notifications organizationId={org.id} userId={user.id} />;
      if (workspaceSection === "activities")
        return (
          <Activities
            organization={org}
            userId={user.id}
            activityId={activityId}
            sessionId={sessionId}
            attendance={attendance}
          />
        );
      if (!["owner", "admin"].includes(org.role))
        return <p role="alert">{m.people_denied()}</p>;
      if (workspaceSection === "manage")
        return <Management organization={org} />;
      if (workspaceSection === "access")
        return <Assignments organization={org} userId={user.id} />;
      if (workspaceSection === "staff" || workspaceSection === "invitations")
        return (
          <Directory
            organization={org}
            userId={user.id}
            section={workspaceSection}
          />
        );
      return (
        <Navigate
          to="/workspace/$organizationId/people/contacts"
          params={{ organizationId: org.id }}
          replace
        />
      );
    }
    if (organizations.isPending) return <AccountSkeleton />;
    if (organizations.isError && !organizations.data)
      return (
        <QueryError
          message={organizations.error.message}
          pending={organizations.isFetching}
          retry={organizations.refetch}
        />
      );
    if (creating || !items.length)
      return (
        <OrganizationSetup
          canCancel={items.length > 0}
          onCancel={() => setCreating(false)}
          onCreated={async (org) => {
            await queryClient.invalidateQueries({ queryKey: orgKey(user.id) });
            queryClient.setQueryData(["organization", user.id, org.id], org);
            await openWorkspace(org.id, org.role);
            setCreating(false);
          }}
        />
      );
    return (
      <section className="organization-list">
        <h1>{m.my_organizations()}</h1>
        <DirectoryList
          label={m.my_organizations()}
          busy={organizations.isFetchingNextPage}
        >
          {items.map((org) => (
            <DirectoryItem key={org.id} linked>
              <Link
                className="directory-item-link"
                to={
                  org.role === "volunteer"
                    ? "/workspace/$organizationId/$section"
                    : "/workspace/$organizationId/people/contacts"
                }
                params={{ organizationId: org.id, section: "activities" }}
              >
                <DirectoryRecord
                  name={org.name}
                  detail={m[`role_${org.role}`]()}
                  icon={<Building2 aria-hidden="true" size={19} />}
                />
                <ChevronRight aria-hidden="true" size={18} />
              </Link>
            </DirectoryItem>
          ))}
        </DirectoryList>
        <InfiniteFooter {...organizations} />
        <Button className="mt-4" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {m.create_organization()}
        </Button>
      </section>
    );
  };
  return (
    <div className="onboarding-shell workspace-shell">
      <section className="onboarding-main">
        <header className="app-header">
          {user ? (
            <>
              <OrganizationSwitcher
                current={selected.data}
                disabled={!user || session.isPending}
                items={items}
                loading={
                  session.isPending || (!!user && organizations.isPending)
                }
                error={
                  organizations.isError ? organizations.error.message : null
                }
                retryPending={organizations.isFetching}
                retry={() => void organizations.refetch()}
                pagination={{
                  ...organizations,
                  fetchNextPage: () =>
                    organizations.fetchNextPage({ cancelRefetch: false }),
                }}
                onSwitch={(org) => void openWorkspace(org.id, org.role)}
                onManage={() => void navigate({ to: "/start" })}
              />
              {workspaceId &&
                selected.data &&
                user?.emailVerified &&
                !selected.isError && (
                  <NotificationBell
                    userId={user.id}
                    organizationId={workspaceId}
                  />
                )}
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="profile-shortcut"
              >
                <Link to="/settings" aria-label={m.profile()}>
                  <CircleUserRound aria-hidden="true" size={22} />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Link to="/" className="brand">
                himmah
              </Link>
              <LanguageSelector />
            </>
          )}
        </header>
        {workspaceId && (
          <WorkspaceNavigation
            organizationId={workspaceId}
            role={selected.isError ? undefined : selected.data?.role}
            section={workspaceSection}
          />
        )}
        <main className="onboarding-content">
          {logout.isError && (
            <ErrorAlert
              message={authFailure(logout.error, m.error_signout())}
            />
          )}{" "}
          {content()}
        </main>
      </section>
    </div>
  );
}
function ErrorAlert({ message }: { message: string }) {
  useLocale();
  return (
    <Alert variant="destructive" role="alert" className="mb-5">
      <AlertDescription>{localizedText(message)}</AlertDescription>
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
  useLocale();
  return (
    <Card>
      <CardContent className="space-y-4">
        <ErrorAlert message={message} />
        <ActionButton pending={pending} onClick={() => retry()}>
          {m.try_again()}
        </ActionButton>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            {m.back_organizations()}
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
  initialMode = "signup",
  onAuthenticated,
}: {
  verificationEmail?: string;
  initialMode?: "signup" | "signin";
  onAuthenticated: () => Promise<unknown>;
}) {
  useLocale();
  const confirm = useConfirmation();
  const [screen, setScreen] = useState<AuthScreen>(
    verificationEmail ? "verify" : initialMode,
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
          title: m.replace_password_title(),
          description: m.replace_password_description(),
          confirmLabel: m.replace_password(),
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
        if (!value.adult) throw Error(m.error_adult());
        if (value.password.length < 12) throw Error(m.error_password_short());
        if (value.password.length > 128) throw Error(m.error_password_long());
        const result = await (
          await authClient()
        ).signUp.email({
          email: value.email.trim(),
          password: value.password,
          name: value.name.trim(),
        });
        if (result.error)
          throw Error(authError(result.error.code, m.error_signup()));
        setScreen("verify");
        const code = await (
          await authClient()
        ).emailOtp
          .sendVerificationOtp({
            email: value.email.trim(),
            type: "email-verification",
          })
          .catch(() => ({ error: true }));
        if (code.error) {
          setNotice(m.notice_account_created());
          return;
        }
        setNotice(m.notice_check_inbox());
      } else if (screen === "signin") {
        const result = await (
          await authClient()
        ).signIn.email({
          email: value.email.trim(),
          password: value.password,
        });
        if (result.error)
          throw Error(authError(result.error.code, m.error_signin()));
        form.setFieldValue("password", "");
        await onAuthenticated();
      } else if (screen === "verify") {
        const result = await (
          await authClient()
        ).emailOtp.verifyEmail({
          email: value.email.trim(),
          otp: value.code,
        });
        if (result.error)
          throw Error(authError(result.error.code, m.error_code()));
        if (value.password) {
          const signed = await (
            await authClient()
          ).signIn.email({
            email: value.email.trim(),
            password: value.password,
          });
          if (signed.error) {
            setScreen("signin");
            form.setFieldValue("password", "");
            setNotice(m.notice_verified());
            return;
          }
        }
        await onAuthenticated();
        setScreen("signin");
        form.setFieldValue("password", "");
        form.setFieldValue("code", "");
        setNotice(m.notice_verified_continue());
      } else if (screen === "recovery-request") {
        const result = await (
          await authClient()
        ).emailOtp.sendVerificationOtp({
          email: value.email.trim(),
          type: "forget-password",
        });
        if (result.error)
          throw Error(authError(result.error.code, m.error_recovery()));
        setScreen("recovery-reset");
        setNotice(m.notice_recovery());
      } else {
        const result = await (
          await authClient()
        ).emailOtp.resetPassword({
          email: value.email.trim(),
          otp: value.code,
          password: value.password,
        });
        if (result.error)
          throw Error(authError(result.error.code, m.error_reset()));
        setScreen("signin");
        form.setFieldValue("password", "");
        form.setFieldValue("code", "");
        setNotice(m.notice_password_updated());
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
        throw Error(authError(result.error.code, m.error_send_code()));
      setNotice(m.notice_code_sent());
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
      ? m.signup_title()
      : screen === "signin"
        ? m.signin_title()
        : screen === "verify"
          ? m.verify_title()
          : m.recovery_title();
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
      <span className="badge">{m.early_access()}</span>
      <div className="eyebrow mt-6">{m.organizer_account()}</div>
      <h1>{title}</h1>
      <p className="onboarding-intro">
        {screen === "signup"
          ? m.signup_intro()
          : screen === "signin"
            ? m.signin_intro()
            : screen === "verify"
              ? m.verify_intro()
              : m.recovery_intro()}
      </p>
      {submission.isError && (
        <ErrorAlert message={authFailure(submission.error)} />
      )}{" "}
      {resend.isError && (
        <ErrorAlert message={authFailure(resend.error, m.error_send_code())} />
      )}{" "}
      {notice && (
        <Alert className="mb-5" role="status">
          <AlertDescription>{localizedText(notice)}</AlertDescription>
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
                    ? m.your_name()
                    : name === "email"
                      ? m.email_address()
                      : name === "password"
                        ? screen === "recovery-reset"
                          ? m.new_password()
                          : m.password()
                        : m.email_code()}
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
                  aria-describedby={
                    name === "password" && screen !== "signin"
                      ? "password-help"
                      : undefined
                  }
                  className="mt-2"
                />
                {name === "password" && screen !== "signin" && (
                  <p
                    id="password-help"
                    className="text-xs text-muted-foreground mt-2"
                  >
                    {m.password_help()}
                  </p>
                )}
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
                  {m.adult_organizer()}
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
                ? m.create_account()
                : screen === "signin"
                  ? m.sign_in()
                  : screen === "verify"
                    ? m.verify_email()
                    : screen === "recovery-request"
                      ? m.send_recovery()
                      : m.reset_password()}
              <ArrowRight size={17} />
            </ActionButton>
          )}
        </form.Subscribe>
      </form>
      <div className="auth-switches">
        {screen === "signin" ? (
          <>
            <p>
              {m.new_here()}{" "}
              <Button
                variant="link"
                onClick={() => navigate("signup")}
                disabled={pending}
              >
                {m.create_an_account()}
              </Button>
            </p>
            <Button
              variant="link"
              disabled={pending}
              onClick={() => navigate("recovery-request")}
            >
              {m.forgot_password()}
            </Button>
            <Button
              variant="link"
              disabled={pending}
              onClick={() => navigate("verify")}
            >
              {m.unverified_account()}
            </Button>
          </>
        ) : screen === "signup" ? (
          <p>
            {m.have_account()}{" "}
            <Button
              variant="link"
              disabled={pending}
              onClick={() => navigate("signin")}
            >
              {m.sign_in()}
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
                {m.send_new_code()}
              </ActionButton>
            )}
            {!verificationEmail && (
              <Button
                variant="link"
                disabled={pending}
                onClick={() => navigate("signin")}
              >
                {m.back_signin()}
              </Button>
            )}
          </>
        )}
      </div>
      <p className="onboarding-disclaimer">{m.setup_scope()}</p>
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
  useLocale();
  const confirm = useConfirmation();
  const creationKey = useRef("");
  const saved = useRef(false);
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
      if (!value.authorized) throw Error(m.error_authorized());
      creationKey.current ||= crypto.randomUUID();
      const input = validateOrganization({
        ...value,
        adultAuthorized: value.authorized,
        creationKey: creationKey.current,
      });
      const result = await api<{ organization: Organization }>(
        "/api/organizations",
        { method: "POST", body: JSON.stringify(input) },
      );
      return result.organization;
    },
    onSuccess: async (organization) => {
      saved.current = true;
      await onCreated(organization);
    },
  });
  useBlocker({
    shouldBlockFn: async () =>
      dirty &&
      !saved.current &&
      !creation.isSuccess &&
      !(await confirm({
        title: m.discard_setup_title(),
        description: m.discard_setup_description(),
        confirmLabel: m.discard_setup(),
        destructive: true,
      })),
    enableBeforeUnload: dirty && !saved.current && !creation.isSuccess,
  });
  async function cancel() {
    if (
      !dirty ||
      (await confirm({
        title: m.discard_setup_title(),
        description: m.discard_setup_description(),
        confirmLabel: m.discard_setup(),
        destructive: true,
      }))
    )
      onCancel();
  }
  return (
    <>
      <div className="eyebrow">{m.your_organization()}</div>
      <h1>{m.setup_title()}</h1>
      <p className="onboarding-intro">{m.setup_intro()}</p>
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
              <Label htmlFor="organization-name">{m.organization_name()}</Label>
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
                placeholder={m.organization_placeholder()}
                disabled={creation.isPending}
                className="mt-2"
              />
            </div>
          )}
        </form.Field>
        <form.Field name="slug">
          {(field) => (
            <div className="mt-5">
              <Label htmlFor="organization-slug">{m.workspace_address()}</Label>
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
                {m.slug_help()}
              </p>
            </div>
          )}
        </form.Field>
        <form.Field name="timezone">
          {(field) => (
            <div className="mt-5">
              <Label htmlFor="organization-timezone">
                {m.organization_timezone()}
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
                {m.authorized_organizer()}
              </Label>
            </div>
          )}
        </form.Field>
        <Alert className="mt-5">
          <AlertDescription>
            <strong>{m.early_access()}</strong>
            <br />
            {m.no_payment()}
          </AlertDescription>
        </Alert>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <ActionButton
              type="submit"
              pending={creation.isPending || isSubmitting}
              className="button primary full"
            >
              {m.create_organization()}
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
            {m.back_organizations()}
          </Button>
        )}
      </form>
    </>
  );
}
