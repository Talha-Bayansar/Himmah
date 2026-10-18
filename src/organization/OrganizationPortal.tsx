"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Leaf,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  Building2,
  ShieldCheck,
  Mail,
  LogOut,
  Plus,
  Clock3,
  Users,
  CalendarDays,
  LoaderCircle,
} from "lucide-react";
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
type Screen = "signin" | "signup" | "verify" | "forgot";
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
export default function OrganizationPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [screen, setScreen] = useState<Screen>("signup");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [timezone, setTimezone] = useState("Europe/Amsterdam");
  const [confirmed, setConfirmed] = useState(false);
  const creationKey = useRef("");
  async function restore() {
    const session = await api<{ user: User }>("/api/account");
    setUser(session.user);
    setEmail(session.user.email);
    const data = await api<{ organizations: Organization[] }>(
      "/api/organizations",
    );
    setOrganizations(data.organizations);
    if (data.organizations.length === 0) setCreating(true);
    return session.user;
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/account", {
          credentials: "same-origin",
        });
        if (cancelled) return;
        if (response.status === 401) return;
        if (!response.ok) {
          setError(
            "Account services are unavailable right now. You can still explore the sample demo.",
          );
          return;
        }
        const body = (await response.json()) as { user: User };
        if (cancelled) return;
        setUser(body.user);
        setEmail(body.user.email);
        const result = await api<{ organizations: Organization[] }>(
          "/api/organizations",
        );
        if (cancelled) return;
        setOrganizations(result.organizations);
        setCreating(result.organizations.length === 0);
      } catch {
        if (!cancelled)
          setError("Could not connect to account services. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }
  function navigate(next: Screen) {
    setScreen(next);
    setError("");
    setNotice("");
    setCode("");
    setPassword("");
  }
  async function sendCode() {
    const result = await authClient().emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    if (result.error)
      throw Error(result.error.message ?? "Could not send verification code.");
    setScreen("verify");
    setNotice(
      "Check your inbox for the verification code. It may take a moment to arrive.",
    );
  }
  async function submitCredentials(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (screen === "signup") {
        const result = await authClient().signUp.email({
          email,
          password,
          name,
        });
        if (result.error)
          throw Error(result.error.message ?? "Could not create account.");
        try {
          await sendCode();
        } catch {
          setScreen("verify");
          setNotice(
            "Account created. Use Send a new code to verify your email.",
          );
        }
      } else if (screen === "signin") {
        const result = await authClient().signIn.email({ email, password });
        if (result.error)
          throw Error(result.error.message ?? "Could not sign in.");
        setPassword("");
        await restore();
      } else if (screen === "verify") {
        const result = await authClient().emailOtp.verifyEmail({
          email,
          otp: code,
        });
        if (result.error)
          throw Error(
            result.error.message ?? "That code could not be verified.",
          );
        if (password) {
          const signIn = await authClient().signIn.email({ email, password });
          if (signIn.error) {
            setScreen("signin");
            setPassword("");
            setNotice("Email verified. Sign in to continue.");
            return;
          }
        }
        try {
          await restore();
          setScreen("signup");
          setPassword("");
          setNotice("Email verified. You can now create your organization.");
        } catch {
          setScreen("signin");
          setPassword("");
          setNotice("Email verified. Sign in to continue.");
        }
      } else {
        // Password recovery code flow uses managed email OTP rather than an external mail provider.
        const response = await authClient().emailOtp.sendVerificationOtp({
          email,
          type: "forget-password",
        });
        if (response.error)
          throw Error(
            response.error.message ?? "Could not request recovery code.",
          );
        setNotice(
          "If your email belongs to an account, a recovery code has been sent. Enter it below to choose a new password.",
        );
      }
    });
  }
  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const result = await authClient().emailOtp.resetPassword({
        email,
        otp: code,
        password,
      });
      if (result.error)
        throw Error(result.error.message ?? "Could not reset password.");
      setScreen("signin");
      setPassword("");
      setCode("");
      setNotice("Password updated. Sign in to continue.");
    });
  }
  async function createOrganization(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (!confirmed)
        throw Error(
          "Confirm that you are authorized to set up this organization.",
        );
      creationKey.current ||= crypto.randomUUID();
      const input = validateOrganization({
        name: organizationName,
        slug,
        timezone,
        creationKey: creationKey.current,
      });
      const result = await api<{ organization: Organization }>(
        "/api/organizations",
        { method: "POST", body: JSON.stringify(input) },
      );
      const all = await api<{ organizations: Organization[] }>(
        "/api/organizations",
      );
      setOrganizations(all.organizations);
      setSelected(result.organization);
      setCreating(false);
      creationKey.current = "";
      setNotice("Your organization has been created and saved.");
    });
  }
  async function signOut() {
    await run(async () => {
      const result = await authClient().signOut();
      if (result.error) throw Error("Could not sign out. Please retry.");
      setUser(null);
      setOrganizations([]);
      setSelected(null);
      setCreating(false);
      setPassword("");
      setScreen("signin");
      setNotice("You’re signed out.");
    });
  }
  const feedback = (
    <>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
    </>
  );
  return (
    <div className="onboarding-shell">
      <aside className="onboarding-story">
        <a href="/" className="brand">
          <div className="brand-mark">
            <Leaf size={27} />
          </div>
          <span>
            himmah<span className="brand-sub">GROW TOGETHER</span>
          </span>
        </a>
        <div className="onboarding-story-copy">
          <div className="eyebrow">FOR THE PEOPLE WHO SHOW UP</div>
          <h1>
            A home for your
            <br />
            youth community.
          </h1>
          <p>
            Bring your activities, attendance and recognition together. Make
            room for every young person to grow.
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
          <ShieldCheck size={17} />
          Organization accounts are separate from the sample demo.
        </div>
      </aside>
      <section className="onboarding-main">
        <header className="onboarding-top">
          <a href="/" className="text-link">
            <ArrowLeft size={15} />
            Explore the demo
          </a>
          {user && (
            <button className="text-link" onClick={signOut} disabled={pending}>
              <LogOut size={16} />
              Sign out
            </button>
          )}
        </header>
        <div className="onboarding-content">
          {loading ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={30} />
              <h2>Finding your workspace…</h2>
            </div>
          ) : !user ? (
            <>
              <span className="badge">Himmah Hub · Early access</span>
              <div className="eyebrow" style={{ marginTop: 24 }}>
                ORGANIZER ACCOUNT
              </div>
              <h1>
                {screen === "signup"
                  ? "Good things start with you."
                  : screen === "signin"
                    ? "Welcome back."
                    : screen === "verify"
                      ? "One more little step."
                      : "Let’s get you back in."}
              </h1>
              <p className="onboarding-intro">
                {screen === "signup"
                  ? "Create your organizer account, then set up your organization."
                  : screen === "signin"
                    ? "Sign in to your saved organization workspaces."
                    : screen === "verify"
                      ? "Verify your email before creating an organization."
                      : "Request an email code to reset your password."}
              </p>
              {feedback}
              <form onSubmit={submitCredentials} className="onboarding-form">
                {screen === "signup" && (
                  <label>
                    Your name
                    <input
                      autoComplete="name"
                      required
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your first and last name"
                    />
                  </label>
                )}
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@your-organization.org"
                  />
                </label>
                {(screen === "signup" || screen === "signin") && (
                  <label>
                    Password
                    <input
                      type="password"
                      autoComplete={
                        screen === "signup"
                          ? "new-password"
                          : "current-password"
                      }
                      required
                      minLength={screen === "signup" ? 12 : 1}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        screen === "signup"
                          ? "At least 12 characters"
                          : "Your password"
                      }
                    />
                  </label>
                )}
                {screen === "signup" && (
                  <label className="checkbox-label">
                    <input type="checkbox" required />
                    I’m an adult organizer setting up a youth organization.
                  </label>
                )}
                {screen === "verify" && (
                  <label>
                    Verification code
                    <input
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      required
                      minLength={6}
                      maxLength={8}
                      value={code}
                      onChange={(e) => setCode(e.target.value.trim())}
                      placeholder="Code from your email"
                    />
                  </label>
                )}
                <button
                  className="button primary full"
                  disabled={pending}
                  type="submit"
                >
                  {pending ? (
                    <LoaderCircle size={18} className="spin" />
                  ) : screen === "signup" ? (
                    "Create organizer account"
                  ) : screen === "signin" ? (
                    "Sign in"
                  ) : screen === "verify" ? (
                    "Verify email"
                  ) : (
                    "Send recovery code"
                  )}
                  {!pending && <ArrowRight size={17} />}
                </button>
              </form>
              {screen === "forgot" && (
                <form className="onboarding-form" onSubmit={resetPassword}>
                  <label>
                    Recovery code
                    <input
                      autoComplete="one-time-code"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    New password
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <button className="button secondary full" disabled={pending}>
                    Reset password
                  </button>
                </form>
              )}
              <div className="auth-switches">
                {screen === "signin" ? (
                  <>
                    <p>
                      New here?{" "}
                      <button
                        onClick={() => navigate("signup")}
                        disabled={pending}
                      >
                        Create an account
                      </button>
                    </p>
                    <button
                      disabled={pending}
                      onClick={() => navigate("forgot")}
                    >
                      Forgot password?
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => {
                        setScreen("verify");
                        setError("");
                      }}
                    >
                      Have an unverified account?
                    </button>
                  </>
                ) : screen === "signup" ? (
                  <p>
                    Already have an account?{" "}
                    <button
                      disabled={pending}
                      onClick={() => navigate("signin")}
                    >
                      Sign in
                    </button>
                  </p>
                ) : (
                  <>
                    {screen === "verify" && (
                      <button
                        disabled={pending || !email}
                        onClick={() => run(sendCode)}
                      >
                        Send a new verification code
                      </button>
                    )}
                    <button
                      disabled={pending}
                      onClick={() => navigate("signin")}
                    >
                      Back to sign in
                    </button>
                  </>
                )}
              </div>
              <p className="onboarding-disclaimer">
                Early-access organization setup only. Youth enrollment and
                persistent activity management are being built next. Use the
                demo to try those screens.
              </p>
            </>
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
              {feedback}
              {!user.emailVerified ? (
                <section className="panel">
                  <Mail size={30} />
                  <h2>Verify your email to continue.</h2>
                  <p className="muted">
                    We’ll send a code to {user.email}. After verification you
                    can create an organization.
                  </p>
                  <form
                    className="onboarding-form"
                    onSubmit={submitCredentials}
                  >
                    <label>
                      Verification code
                      <input
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value);
                          setScreen("verify");
                        }}
                        inputMode="numeric"
                        required
                        autoComplete="one-time-code"
                      />
                    </label>
                    <button
                      type="submit"
                      className="button primary full"
                      disabled={pending}
                      onClick={() => setScreen("verify")}
                    >
                      Verify email
                    </button>
                  </form>
                  <button
                    className="button secondary full"
                    disabled={pending}
                    onClick={() => run(sendCode)}
                  >
                    Send verification code
                  </button>
                </section>
              ) : creating ? (
                <>
                  <div className="eyebrow">YOUR ORGANIZATION</div>
                  <h1>Make this space yours.</h1>
                  <p className="onboarding-intro">
                    Start with a name and a timezone. Your organization will
                    have its own members, activities and progress.
                  </p>
                  <form
                    className="onboarding-form"
                    onSubmit={createOrganization}
                  >
                    <label>
                      Organization name
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        value={organizationName}
                        onChange={(e) => {
                          setOrganizationName(e.target.value);
                          if (!slugEdited)
                            setSlug(organizationSlug(e.target.value));
                        }}
                        placeholder="e.g. Noor Mosque Youth"
                      />
                    </label>
                    <label>
                      Workspace address
                      <input
                        required
                        minLength={3}
                        maxLength={48}
                        value={slug}
                        onChange={(e) => {
                          setSlugEdited(true);
                          setSlug(e.target.value.toLowerCase());
                        }}
                        placeholder="noor-mosque-youth"
                      />
                      <small>
                        A unique name to identify your workspace. Lowercase
                        letters, numbers and hyphens.
                      </small>
                    </label>
                    <label>
                      Organization timezone
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
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
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        required
                      />
                      I am authorized to create and manage this organization.
                    </label>
                    <div className="info-note">
                      <strong>Himmah Hub · Early access</strong>
                      <br />
                      No payment or game license is required to create your
                      workspace. Paid plans and optional games will come later.
                    </div>
                    <button className="button primary full" disabled={pending}>
                      {pending ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : (
                        <>
                          Create organization
                          <ArrowRight size={17} />
                        </>
                      )}
                    </button>
                    {organizations.length > 0 && (
                      <button
                        type="button"
                        className="button secondary full"
                        disabled={pending}
                        onClick={() => setCreating(false)}
                      >
                        Back to my organizations
                      </button>
                    )}
                  </form>
                </>
              ) : selected ? (
                <>
                  <button
                    className="text-link"
                    onClick={() => {
                      setSelected(null);
                      setNotice("");
                    }}
                  >
                    <ArrowLeft size={16} />
                    My organizations
                  </button>
                  <div className="workspace-welcome">
                    <span className="workspace-monogram">
                      {selected.name.slice(0, 1)}
                    </span>
                    <div className="eyebrow">YOUR ORGANIZATION WORKSPACE</div>
                    <h1>{selected.name}</h1>
                    <p className="onboarding-intro">
                      Your space is ready. Organization setup is saved securely
                      and stays available when you sign in again.
                    </p>
                  </div>
                  <div className="workspace-detail-grid">
                    <div>
                      <Building2 size={19} />
                      <span>Workspace</span>
                      <strong>{selected.slug}</strong>
                    </div>
                    <div>
                      <Clock3 size={19} />
                      <span>Timezone</span>
                      <strong>{selected.timezone}</strong>
                    </div>
                    <div>
                      <ShieldCheck size={19} />
                      <span>Your role</span>
                      <strong>{selected.role}</strong>
                    </div>
                  </div>
                  <div className="panel onboarding-next">
                    <span className="badge">Coming next</span>
                    <h2>Bring your community in.</h2>
                    <p>
                      Member invitations, groups, activities, attendance and
                      points are the next persistent features. They are not
                      connected to this workspace yet.
                    </p>
                    <a href="/" className="button secondary">
                      Explore those flows in the demo
                      <ArrowRight size={17} />
                    </a>
                  </div>
                  <p className="onboarding-disclaimer">
                    No sample children, attendance or points have been added to
                    your organization. The demo and this saved workspace are
                    separate.
                  </p>
                </>
              ) : (
                <>
                  <div className="eyebrow">YOUR COMMUNITIES</div>
                  <h1>A place for every organization.</h1>
                  <p className="onboarding-intro">
                    Choose a saved workspace or create a new one.
                  </p>
                  <div className="organization-list">
                    {organizations.map((o) => (
                      <button
                        key={o.id}
                        className="organization-choice"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const result = await api<{
                              organization: Organization;
                            }>(`/api/organizations/${o.id}`);
                            setSelected(result.organization);
                          })
                        }
                      >
                        <span className="avatar">
                          <Building2 size={20} />
                        </span>
                        <span>
                          <strong>{o.name}</strong>
                          <small>
                            {o.slug} · {o.role}
                          </small>
                        </span>
                        <ArrowRight size={18} />
                      </button>
                    ))}
                  </div>
                  <button
                    className="button primary full"
                    onClick={() => {
                      setCreating(true);
                      setOrganizationName("");
                      setSlug("");
                      setSlugEdited(false);
                      setConfirmed(false);
                      creationKey.current = "";
                    }}
                  >
                    <Plus size={17} />
                    Create another organization
                  </button>
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
