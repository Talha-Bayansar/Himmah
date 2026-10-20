import {
  NotificationBell,
  Notifications,
} from "../notifications/Notifications";
import { disablePush } from "../notifications/push-client";
import Challenges from "../challenges/Challenges";
import Collection from "../coupons/Collection";
import MyCoupons from "../coupons/MyCoupons";
import { Management, OrganizationDetails, PeopleTabs } from "./Management";
import PersonalDashboard from "../participants/PersonalDashboard";
import ParticipantAccountPage from "../participants/ParticipantAccountPage";
import AcceptParticipant from "../participants/AcceptParticipant";
import Rewards from "../rewards/Rewards";
import Assignments from "../access/Assignments";
import VolunteerMembers from "../access/VolunteerMembers";
import Periods from "../periods/Periods";
import MemberPage from "../points/MemberPage";
import Activities from "../activities/Activities";
import GroupMembersPage from "../community/GroupMembersPage";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import { AccountSettings } from "./AccountSettings";
import { Navigate, useNavigate } from "@tanstack/react-router";
import {
  WorkspaceNavigation,
  type WorkspaceSection,
} from "./WorkspaceNavigation";
import Directory from "../community/Directory";
import AcceptInvite from "../community/AcceptInvite";
import { InfiniteFooter } from "../components/shared/infinite-list";
import { InstallApp } from "../pwa/install";
import { m } from "../paraglide/messages.js";
import { LanguageSelector, useLocale } from "../localization/locale";
import { localizedText, authError, authFailure } from "../localization/errors";
import { useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useForm, useStore } from "@tanstack/react-form";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import {
  Leaf,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Building2,
  ShieldCheck,
  Plus,
  CircleUserRound,
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
  challengeId = null,
  challengeSubmissionId = null,
  challengeView,
  couponId = null,
  couponStatus = "pending",
  participantInviteToken = null,
  participantAccount = false,
  participantAccountView = "invitations",
  workspaceId = null,
  workspaceSection = "members",
  accountSettings = false,
  rewardId = null,
  rewardView = "members",
  periodId = null,
  periodGroupId = null,
  periodView = "members",
  memberId = null,
  groupId = null,
  activityId = null,
  sessionId = null,
  attendance = false,
  launch = false,
}: {
  initialMode?: "signup" | "signin";
  inviteToken?: string | null;
  challengeId?: string | null;
  challengeSubmissionId?: string | null;
  challengeView?: string | undefined;
  couponId?: string | null;
  couponStatus?: "pending" | "all";
  participantInviteToken?: string | null;
  participantAccount?: boolean;
  participantAccountView?: "invitations" | "history";
  workspaceId?: string | null;
  workspaceSection?: WorkspaceSection;
  accountSettings?: boolean;
  rewardId?: string | null;
  rewardView?: "members" | "redemptions";
  periodId?: string | null;
  periodGroupId?: string | null;
  periodView?: "members" | "groups";
  memberId?: string | null;
  groupId?: string | null;
  activityId?: string | null;
  sessionId?: string | null;
  attendance?: boolean;
  launch?: boolean;
} = {}) {
  const queryClient = useQueryClient();
  useLocale();
  const confirm = useConfirmation();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const selectedId = workspaceId;
  const openWorkspace = (id: string, role: string = "owner") =>
    navigate({
      to: "/workspace/$organizationId/$section",
      params: {
        organizationId: id,
        section:
          role === "participant"
            ? "me"
            : role === "volunteer"
              ? "activities"
              : workspaceId
                ? ["me", "my-rewards", "my-redemptions", "my-coupons"].includes(
                    workspaceSection,
                  )
                  ? "activities"
                  : workspaceSection
                : "activities",
      },
    });
  const closeWorkspace = () => navigate({ to: "/start" });
  const session = useQuery({
    queryKey: accountKey,
    queryFn: account,
    retry: false,
  });
  const user = session.data;
  const organizations = useInfiniteQuery({
    queryKey: orgKey(user?.id ?? "signed-out"),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) =>
      api<{ organizations: Organization[]; nextCursor?: string | null }>(
        "/api/organizations" +
          (pageParam ? "?cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!user,
    retry: false,
  });
  const organizationItems =
    organizations.data?.pages.flatMap((page) => page.organizations) ?? [];
  const selected = useQuery({
    queryKey: ["organization", user?.id, selectedId],
    queryFn: async ({ signal }) =>
      (
        await api<{ organization: Organization }>(
          `/api/organizations/${selectedId}`,
          { signal },
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
      await disablePush();
      const result = await (await authClient()).signOut();
      if (result.error)
        throw Error(authError(result.error.code, m.error_signout()));
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(accountKey, null);
      if (workspaceId || accountSettings) void closeWorkspace();
      setCreating(false);
    },
  });
  async function signOut() {
    if (
      await confirm({
        title: m.sign_out_title(),
        description: m.sign_out_description(),
        confirmLabel: m.sign_out(),
      })
    )
      logout.mutate();
  }
  const launching = useRef(false);
  useEffect(() => {
    if (!launch || launching.current || session.isPending || session.isError)
      return;
    if (!user || !user.emailVerified) {
      launching.current = true;
      void navigate({
        to: "/start",
        search: { mode: "signin" },
        replace: true,
      });
    } else if (organizations.isSuccess) {
      launching.current = true;
      const only =
        organizationItems.length === 1 && !organizations.hasNextPage
          ? organizationItems[0]
          : null;
      if (only)
        void navigate({
          to: "/workspace/$organizationId/$section",
          params: {
            organizationId: only.id,
            section: only.role === "participant" ? "me" : "activities",
          },
          replace: true,
        });
      else void navigate({ to: "/start", replace: true });
    }
  }, [
    launch,
    session.isPending,
    session.isError,
    user,
    organizations.isSuccess,
    organizations.hasNextPage,
    organizationItems,
    navigate,
  ]);
  const loading =
    session.isPending ||
    (launch && !session.isError && !organizations.isError) ||
    (!!user && !workspaceId && !accountSettings && organizations.isPending);
  const appShell = launch || !!workspaceId || accountSettings || !!user;
  return (
    <div
      className={
        appShell ? "onboarding-shell workspace-shell" : "onboarding-shell"
      }
    >
      <aside className="onboarding-story">
        <Link to="/" className="brand">
          <div className="brand-mark">
            <Leaf size={27} />
          </div>
          <span>
            himmah<span className="brand-sub">{m.brand_tagline()}</span>
          </span>
        </Link>
        <div className="onboarding-story-copy">
          <div className="eyebrow">{m.story_eyebrow()}</div>
          <h1>{m.landing_title()}</h1>
          <p>
            {participantInviteToken
              ? m.participant_join_help()
              : m.story_intro()}
          </p>
          <ul>
            <li>
              <CheckCircle2 size={20} />
              <span>{m.workspace_benefit()}</span>
            </li>
            <li>
              <CheckCircle2 size={20} />
              <span>{m.verified_account_benefit()}</span>
            </li>
            <li>
              <CheckCircle2 size={20} />
              <span>{m.saved_benefit()}</span>
            </li>
          </ul>
          <div className="onboarding-orbit" aria-hidden="true">
            <Leaf size={150} strokeWidth={0.8} />
            <span>✦</span>
          </div>
        </div>
        <div className="onboarding-story-footer">
          <ShieldCheck size={17} />
          {m.dedicated_space()}
        </div>
      </aside>
      <section className="onboarding-main">
        <header className={appShell ? "app-header" : "onboarding-top"}>
          {appShell ? (
            <>
              <OrganizationSwitcher
                current={selected.data}
                disabled={session.isPending || !user}
                retryPending={
                  organizations.isFetching && !organizations.isFetchingNextPage
                }
                items={organizationItems}
                loading={session.isPending || organizations.isPending}
                error={
                  organizations.isError && !organizations.isFetchNextPageError
                    ? organizations.error.message
                    : null
                }
                retry={() => {
                  void organizations.refetch();
                }}
                pagination={{
                  ...organizations,
                  fetchNextPage: () =>
                    organizations.fetchNextPage({ cancelRefetch: false }),
                }}
                onSwitch={(org) => {
                  void openWorkspace(org.id, org.role);
                }}
                onManage={() => {
                  setCreating(false);
                  void closeWorkspace();
                }}
              />
              {workspaceId &&
                selected.data &&
                user?.emailVerified &&
                !selected.isError && (
                  <NotificationBell
                    key={user.id + workspaceId}
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
                {workspaceId && user?.emailVerified ? (
                  <Link
                    to="/workspace/$organizationId/$section"
                    params={{
                      organizationId: workspaceId,
                      section: "settings",
                    }}
                    aria-label={m.profile()}
                  >
                    <CircleUserRound size={22} />
                  </Link>
                ) : (
                  <Link to="/settings" aria-label={m.profile()}>
                    <CircleUserRound size={22} />
                  </Link>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="link" asChild>
                <Link to="/">
                  <ArrowLeft size={15} />
                  {m.back_home()}
                </Link>
              </Button>
              <LanguageSelector />
            </>
          )}
        </header>
        {workspaceId && (
          <WorkspaceNavigation
            organizationId={workspaceId}
            role={selected.data?.role}
            section={workspaceSection}
          />
        )}
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
              participant={!!participantInviteToken}
              initialMode={initialMode}
              onAuthenticated={() =>
                queryClient.invalidateQueries({ queryKey: accountKey })
              }
            />
          ) : (
            <>
              {logout.isError && (
                <ErrorAlert
                  message={authFailure(logout.error, m.error_signout())}
                />
              )}
              {accountSettings ? (
                <AccountSettings
                  user={user}
                  pending={logout.isPending}
                  onSignOut={signOut}
                />
              ) : !user.emailVerified ? (
                <AuthForm
                  key={user.id}
                  verificationEmail={user.email}
                  participant={!!participantInviteToken}
                  onAuthenticated={() =>
                    queryClient.invalidateQueries({ queryKey: accountKey })
                  }
                />
              ) : participantInviteToken ? (
                <AcceptParticipant
                  token={participantInviteToken}
                  userId={user.id}
                  onSignOut={signOut}
                  pending={logout.isPending}
                />
              ) : inviteToken ? (
                <AcceptInvite token={inviteToken} userId={user.id} />
              ) : organizations.isError &&
                !organizations.data &&
                !selectedId ? (
                <QueryError
                  message={organizations.error.message}
                  pending={organizations.isFetching}
                  retry={() => organizations.refetch()}
                />
              ) : creating ||
                (!selectedId && organizationItems.length === 0) ? (
                <OrganizationSetup
                  canCancel={organizationItems.length > 0}
                  onCancel={() => setCreating(false)}
                  onCreated={async (org) => {
                    await queryClient.invalidateQueries({
                      queryKey: orgKey(user.id),
                    });
                    queryClient.setQueryData(
                      ["organization", user.id, org.id],
                      org,
                    );
                    await openWorkspace(org.id);
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
                    onBack={() => void closeWorkspace()}
                  />
                ) : selected.data ? (
                  <Workspace
                    organization={selected.data}
                    userId={user.id}
                    section={workspaceSection}
                    attendance={attendance}
                    sessionId={sessionId}
                    activityId={activityId}
                    rewardId={rewardId}
                    rewardView={rewardView}
                    periodId={periodId}
                    periodGroupId={periodGroupId}
                    periodView={periodView}
                    challengeId={challengeId}
                    challengeSubmissionId={challengeSubmissionId}
                    challengeView={challengeView}
                    couponId={couponId}
                    couponStatus={couponStatus}
                    participantAccount={participantAccount}
                    participantAccountView={participantAccountView}
                    memberId={memberId}
                    groupId={groupId}
                    user={user}
                    signOutPending={logout.isPending}
                    onSignOut={signOut}
                  />
                ) : null
              ) : (
                <>
                  <div className="eyebrow">{m.your_communities()}</div>
                  <h1>{m.organizations_title()}</h1>
                  <p className="onboarding-intro">{m.organizations_intro()}</p>
                  <div className="organization-list">
                    {organizationItems.map((org) => (
                      <Button
                        variant="outline"
                        key={org.id}
                        className="organization-choice h-auto"
                        onClick={() => void openWorkspace(org.id, org.role)}
                      >
                        <span className="avatar">
                          <Building2 size={20} />
                        </span>
                        <span>
                          <strong>{org.name}</strong>
                          <small>
                            {org.slug} · {m[`role_${org.role}`]()}
                          </small>
                        </span>
                        <ArrowRight size={18} />
                      </Button>
                    ))}
                  </div>
                  <InfiniteFooter
                    {...organizations}
                    fetchNextPage={() =>
                      organizations.fetchNextPage({ cancelRefetch: false })
                    }
                  />
                  <Button
                    className="button primary full"
                    onClick={() => setCreating(true)}
                  >
                    <Plus size={17} />
                    {m.create_another()}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
        {!appShell && (
          <footer className="onboarding-footer">
            <Leaf size={14} />
            {m.footer_tagline()}
            <InstallApp />
          </footer>
        )}
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
      <CardContent className="space-y-4 pt-6">
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
  participant = false,
  verificationEmail,
  initialMode = "signup",
  onAuthenticated,
}: {
  participant?: boolean;
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
        if (!participant && !value.adult) throw Error(m.error_adult());
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
      ? participant
        ? m.participant_signup_title()
        : m.signup_title()
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
      <div className="eyebrow mt-6">
        {participant ? m.participant_account() : m.organizer_account()}
      </div>
      <h1>{title}</h1>
      <p className="onboarding-intro">
        {screen === "signup"
          ? participant
            ? m.participant_join_help()
            : m.signup_intro()
          : screen === "signin"
            ? participant
              ? m.participant_join_help()
              : m.signin_intro()
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
                    ? participant
                      ? m.participant_nickname()
                      : m.your_name()
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
                    name === "password"
                      ? 128
                      : name === "code"
                        ? 8
                        : name === "name" && participant
                          ? 80
                          : 254
                  }
                  autoComplete={
                    name === "password"
                      ? screen === "signin"
                        ? "current-password"
                        : "new-password"
                      : name === "code"
                        ? "one-time-code"
                        : name === "name"
                          ? participant
                            ? "nickname"
                            : "name"
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
        {screen === "signup" && !participant && (
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
                ? participant
                  ? m.participant_signup_title()
                  : m.create_account()
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
      {!participant && (
        <p className="onboarding-disclaimer">{m.setup_scope()}</p>
      )}
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
function Workspace({
  organization,
  userId,
  section,
  user,
  signOutPending,
  onSignOut,
  rewardId,
  rewardView,
  periodId,
  periodGroupId,
  periodView,
  challengeId,
  challengeSubmissionId,
  challengeView,
  couponId,
  couponStatus,
  participantAccount,
  participantAccountView,
  memberId,
  groupId,
  activityId,
  sessionId,
  attendance,
}: {
  organization: Organization;
  userId: string;
  section: WorkspaceSection;
  user: User;
  rewardId: string | null;
  rewardView: "members" | "redemptions";
  periodId: string | null;
  periodGroupId: string | null;
  periodView: "members" | "groups";
  challengeId: string | null;
  challengeSubmissionId: string | null;
  challengeView?: string | undefined;
  couponId: string | null;
  couponStatus: "pending" | "all";
  participantAccount: boolean;
  participantAccountView: "invitations" | "history";
  memberId: string | null;
  groupId: string | null;
  activityId: string | null;
  sessionId: string | null;
  attendance: boolean;
  signOutPending: boolean;
  onSignOut: () => void;
}) {
  useLocale();
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    page.current
      ?.querySelector<HTMLElement>("[data-page-heading]")
      ?.focus({ preventScroll: true });
  }, [
    section,
    organization.id,
    memberId,
    rewardId,
    rewardView,
    periodId,
    periodGroupId,
    groupId,
    activityId,
    sessionId,
    attendance,
  ]);
  if (section === "notifications")
    return (
      <Notifications
        key={userId + organization.id}
        userId={userId}
        organizationId={organization.id}
      />
    );
  if (section === "challenges")
    return organization.role === "volunteer" ? (
      <Navigate
        to="/workspace/$organizationId/$section"
        params={{ organizationId: organization.id, section: "activities" }}
        replace
      />
    ) : (
      <Challenges
        key={
          organization.id +
          (challengeId ?? "list") +
          (challengeSubmissionId ?? "") +
          (challengeView ?? "")
        }
        organization={organization}
        userId={userId}
        challengeId={challengeId}
        submissionId={challengeSubmissionId}
        view={challengeView}
      />
    );
  if (section === "organization")
    return <OrganizationDetails organization={organization} />;
  if (organization.role === "participant") {
    if (section === "my-redemptions")
      return (
        <Navigate
          to="/workspace/$organizationId/my-coupons"
          params={{ organizationId: organization.id }}
          search={{ status: "all" }}
          replace
        />
      );
    if (section === "my-coupons")
      return (
        <MyCoupons
          key={organization.id + (couponId ?? "list") + couponStatus}
          organization={organization}
          userId={userId}
          couponId={couponId}
          status={couponStatus}
        />
      );

    if (section === "settings")
      return (
        <AccountSettings
          user={user}
          organization={organization}
          pending={signOutPending}
          onSignOut={onSignOut}
        />
      );
    if (!["me", "my-rewards", "my-redemptions", "my-coupons"].includes(section))
      return (
        <Navigate
          to="/workspace/$organizationId/$section"
          params={{ organizationId: organization.id, section: "me" }}
          replace
        />
      );
    return (
      <PersonalDashboard
        key={organization.id + section}
        organization={organization}
        userId={userId}
        view={section === "my-rewards" ? "rewards" : "home"}
      />
    );
  }
  if (
    section === "me" ||
    section === "my-rewards" ||
    section === "my-redemptions" ||
    section === "my-coupons"
  )
    return (
      <Navigate
        to="/workspace/$organizationId/$section"
        params={{ organizationId: organization.id, section: "members" }}
        replace
      />
    );
  return (
    <div ref={page}>
      {section === "collect" ? (
        ["owner", "admin"].includes(organization.role) ? (
          <Collection
            key={organization.id}
            organization={organization}
            userId={userId}
          />
        ) : (
          <Navigate
            to="/workspace/$organizationId/$section"
            params={{ organizationId: organization.id, section: "activities" }}
            replace
          />
        )
      ) : section === "manage" ? (
        ["owner", "admin"].includes(organization.role) ? (
          <Management organization={organization} />
        ) : (
          <Navigate
            to="/workspace/$organizationId/$section"
            params={{ organizationId: organization.id, section: "activities" }}
            replace
          />
        )
      ) : section === "activities" ? (
        <Activities
          attendance={attendance}
          sessionId={sessionId}
          key={organization.id}
          organization={organization}
          userId={userId}
          activityId={activityId}
        />
      ) : section === "settings" ? (
        <AccountSettings
          user={user}
          organization={organization}
          pending={signOutPending}
          onSignOut={onSignOut}
        />
      ) : (
        <>
          {(section === "staff" || section === "invitations") && (
            <Button variant="link" className="settings-back" asChild>
              <Link
                to="/workspace/$organizationId/$section"
                params={{
                  organizationId: organization.id,
                  section: "manage",
                }}
              >
                <ArrowLeft size={16} />
                {m.back_to_manage()}
              </Link>
            </Button>
          )}
          {organization.role === "owner" || organization.role === "admin" ? (
            section === "rewards" ? (
              <Rewards
                key={organization.id + (rewardId ?? "list") + rewardView}
                organization={organization}
                userId={userId}
                rewardId={rewardId}
                view={rewardView}
              />
            ) : section === "access" ? (
              <Assignments organization={organization} userId={userId} />
            ) : section === "periods" ? (
              <Periods
                key={organization.id + (periodId ?? "list")}
                organization={organization}
                userId={userId}
                periodId={periodId}
                groupId={periodGroupId}
                view={periodView}
              />
            ) : memberId && participantAccount ? (
              <ParticipantAccountPage
                key={organization.id + memberId + participantAccountView}
                organization={organization}
                userId={userId}
                memberId={memberId}
                view={participantAccountView}
              />
            ) : memberId ? (
              <MemberPage
                key={organization.id + memberId}
                organization={organization}
                userId={userId}
                memberId={memberId}
              />
            ) : groupId ? (
              <GroupMembersPage
                key={organization.id + groupId}
                organization={organization}
                userId={userId}
                groupId={groupId}
              />
            ) : (
              <>
                {(section === "members" || section === "groups") && (
                  <PeopleTabs
                    organizationId={organization.id}
                    section={section}
                  />
                )}
                <Directory
                  key={organization.id + section}
                  section={
                    section === "groups" ||
                    section === "staff" ||
                    section === "invitations"
                      ? section
                      : "people"
                  }
                  organization={organization}
                  userId={userId}
                />
              </>
            )
          ) : memberId ? (
            <MemberPage
              key={organization.id + memberId}
              organization={organization}
              userId={userId}
              memberId={memberId}
            />
          ) : section === "members" ? (
            <VolunteerMembers organization={organization} userId={userId} />
          ) : (
            <p>{m.directory_volunteer_access()}</p>
          )}
        </>
      )}
    </div>
  );
}
