"use client";
import {
  useState,
  useRef,
  useEffect,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Home,
  LayoutGrid,
  Leaf,
  MapPin,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Trophy,
  ArrowLeft,
  CheckCircle2,
  Gift,
  RotateCcw,
} from "lucide-react";
import {
  sampleWorkspaces,
  totalPoints,
  eligible,
  register,
  publishActivity,
  saveAttendance,
  awardPoints,
  validateDraft,
  groups,
  type Attendance,
  type Activity,
  type ActivityDraft,
} from "./model";
type Page = "home" | "activities" | "progress" | "apps" | "checkin" | "create";
type Modal = "activity" | "review" | "award" | null;
const pointLabels = {
  none: "Attendance only",
  attendance: "Attendance points",
  manual: "Manual awards",
  custom: "Approved contribution",
};
const dateLabel = (s: string) =>
  new Date(`${s}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const blank: ActivityDraft = {
  title: "",
  description: "",
  location: "",
  date: "2026-10-23",
  time: "18:00",
  endTime: "20:00",
  group: "All youth",
  mode: "none",
  points: 10,
  registration: false,
  capacity: 20,
};
function IconMark() {
  return (
    <div className="brand-mark">
      <Leaf size={25} />
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Hub() {
  const [workspaces, setWorkspaces] = useState(sampleWorkspaces);
  const [workspaceId, setWorkspaceId] = useState("crescent");
  const [staff, setStaff] = useState(false);
  const [page, setPage] = useState<Page>("home");
  const [memberId, setMemberId] = useState("yusuf");
  const [activityId, setActivityId] = useState("youth-evening");
  const [modal, setModal] = useState<Modal>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState("all");
  const [changes, setChanges] = useState<Record<string, Attendance>>({});
  const [reason, setReason] = useState("");
  const [awardMembers, setAwardMembers] = useState<string[]>([]);
  const [awardAmount, setAwardAmount] = useState(10);
  const [awardReason, setAwardReason] = useState("");
  const [draft, setDraft] = useState<ActivityDraft>({ ...blank });
  const [step, setStep] = useState(0);
  const [period, setPeriod] = useState("all");
  const [progressTab, setProgressTab] = useState("points");
  const [draftSaved, setDraftSaved] = useState(false);
  const [previewAward, setPreviewAward] = useState(false);
  const draftRef = useRef<ActivityDraft | null>(null);
  const workspace = workspaces.find((w) => w.id === workspaceId)!;
  const member =
    workspace.members.find((m) => m.id === memberId) ?? workspace.members[0]!;
  const activity =
    workspace.activities.find((a) => a.id === activityId) ??
    workspace.activities[0]!;
  const changeCount = Object.keys(changes).length;
  const dirty =
    changeCount > 0 ||
    (page === "create" &&
      !draftSaved &&
      (draft.title !== "" ||
        draft.description !== "" ||
        draft.location !== ""));
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function clearFeedback() {
    setError("");
    setMessage("");
  }
  function canLeave() {
    return !dirty || window.confirm("Discard your unsaved changes?");
  }
  function go(next: Page) {
    if (!canLeave()) return;
    setPage(next);
    setChanges({});
    setSearch("");
    setAttendanceFilter("all");
    setModal(null);
    clearFeedback();
  }
  function update(transform: (w: typeof workspace) => typeof workspace) {
    setWorkspaces((all) =>
      all.map((w) => (w.id === workspaceId ? transform(w) : w)),
    );
  }
  function attempt(action: () => void) {
    try {
      setError("");
      action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    }
  }
  function changeWorkspace(id: string) {
    if (!canLeave()) return;
    const w = workspaces.find((w) => w.id === id)!;
    setWorkspaceId(id);
    setMemberId(w.members[0]!.id);
    setActivityId(w.activities[0]!.id);
    setChanges({});
    setPage("home");
    setModal(null);
    setSearch("");
    draftRef.current = null;
    setDraft({ ...blank });
    setStep(0);
    clearFeedback();
  }
  function openActivity(a: Activity) {
    setActivityId(a.id);
    setModal("activity");
    clearFeedback();
  }
  function openCheckin(a: Activity) {
    if (!canLeave()) return;
    setActivityId(a.id);
    setPage("checkin");
    setChanges({});
    setSearch("");
    setAttendanceFilter("all");
    clearFeedback();
  }
  const awards = workspace.awards
    .filter(
      (a) =>
        a.memberId === member.id &&
        (period === "all" || a.date >= "2026-10-12"),
    )
    .slice()
    .reverse();
  const points = awards.reduce((n, a) => n + a.amount, 0);
  const personalActivities = workspace.activities.filter((a) =>
    eligible(a, member),
  );
  const menu = staff
    ? [
        { id: "home" as Page, label: "Overview", icon: Home },
        { id: "activities" as Page, label: "Activities", icon: CalendarDays },
        { id: "checkin" as Page, label: "Check-in", icon: ClipboardCheck },
        { id: "progress" as Page, label: "Members & points", icon: Users },
        { id: "apps" as Page, label: "Connected apps", icon: LayoutGrid },
      ]
    : [
        { id: "home" as Page, label: "Home", icon: Home },
        { id: "activities" as Page, label: "Activities", icon: CalendarDays },
        { id: "progress" as Page, label: "My progress", icon: TrendingUp },
        { id: "apps" as Page, label: "My apps", icon: LayoutGrid },
      ];
  function startCreate() {
    if (!canLeave()) return;
    setDraft(draftRef.current ?? { ...blank });
    setDraftSaved(false);
    setStep(0);
    setPage("create");
    clearFeedback();
  }
  function field<K extends keyof ActivityDraft>(
    key: K,
    value: ActivityDraft[K],
  ) {
    setDraft((old) => ({ ...old, [key]: value }));
    setDraftSaved(false);
    setError("");
  }
  function nextStep() {
    const issues = validateDraft(draft);
    const relevant =
      step === 0
        ? issues.filter(
            (s) =>
              s.includes("title") ||
              s.includes("location") ||
              s.includes("group"),
          )
        : step === 1
          ? issues.filter(
              (s) =>
                s.includes("date") ||
                s.includes("time") ||
                s.includes("Capacity"),
            )
          : issues.filter((s) => s.includes("points") || s.includes("rule"));
    if (relevant.length) {
      setError(relevant.join(" "));
      return;
    }
    setStep(step + 1);
    setError("");
  }
  function commitAttendance() {
    attempt(() => {
      const next = saveAttendance(
        workspace,
        activity.id,
        changes,
        activity.revision,
        crypto.randomUUID(),
        reason,
      );
      update(() => next);
      setChanges({});
      setModal(null);
      setReason("");
      setMessage(
        "Attendance saved. Any linked point changes are in the contribution history.",
      );
    });
  }
  function submitAward(e: FormEvent) {
    e.preventDefault();
    if (!previewAward) {
      if (
        !awardMembers.length ||
        !awardReason.trim() ||
        awardAmount < 1 ||
        awardAmount > 100
      ) {
        setError("Choose recipients, 1–100 points, and a reason.");
        return;
      }
      setPreviewAward(true);
      return;
    }
    attempt(() => {
      const next = awardPoints(
        workspace,
        awardMembers,
        awardAmount,
        awardReason,
        crypto.randomUUID(),
      );
      update(() => next);
      setModal(null);
      setMessage(
        `${awardAmount} points awarded to ${awardMembers.length} ${awardMembers.length === 1 ? "member" : "members"}.`,
      );
    });
  }
  function showAward() {
    setAwardMembers([]);
    setAwardAmount(10);
    setAwardReason("");
    setPreviewAward(false);
    setModal("award");
    clearFeedback();
  }
  const openModal = (content: ReactNode, title: string) => (
    <Dialog
      title={title}
      onClose={() => {
        setModal(null);
        setError("");
      }}
    >
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {content}
    </Dialog>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <IconMark />
          <span>
            himmah<span className="brand-sub">YOUTH ENGAGEMENT</span>
          </span>
        </a>
        <label className="workspace-label">
          YOUR COMMUNITY
          <select
            aria-label="Workspace"
            value={workspaceId}
            onChange={(e) => changeWorkspace(e.target.value)}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <div className="sidebar-section">
          {staff ? "YOUR WORKSPACE" : "YOUR SPACE"}
        </div>
        <nav>
          {menu.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "selected" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              <item.icon size={20} />
              {item.label}
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="community-note">
            <Sparkles size={22} />
            <strong>
              Small actions.
              <br />
              Lasting impact.
            </strong>
            <p>
              Your community grows
              <br />
              with every contribution.
            </p>
          </div>
          <button
            className="view-switch"
            onClick={() => {
              if (!canLeave()) return;
              setStaff(!staff);
              setPage("home");
              setChanges({});
              setModal(null);
              clearFeedback();
            }}
          >
            <Users size={18} />
            Switch to {staff ? "youth" : "staff"} view
            <ArrowRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <IconMark />
            <strong>himmah</strong>
          </div>
          <div className="breadcrumb">
            Your community <span>/</span> <strong>Himmah Hub</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span />
              Interactive demo
            </span>
            <label className="member-select">
              <span className="sr-only">Preview member</span>
              <select
                value={member.id}
                onChange={(e) => {
                  if (!canLeave()) return;
                  setMemberId(e.target.value);
                  setChanges({});
                  clearFeedback();
                }}
              >
                {workspace.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="avatar small">
              {staff ? "V" : member.initials}
            </span>
          </div>
        </header>
        <div className="mobile-controls">
          <select
            aria-label="Mobile workspace"
            value={workspaceId}
            onChange={(e) => changeWorkspace(e.target.value)}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!canLeave()) return;
              setStaff(!staff);
              setChanges({});
              setPage("home");
            }}
          >
            {staff ? "Youth view" : "Staff view"}
          </button>
        </div>
        <main>
          <div className="prototype-note">
            <span>Sample data only · Explore the youth and staff views.</span>
            <button
              onClick={() => {
                if (
                  !window.confirm(
                    "Reset all sample activities, attendance and points?",
                  )
                )
                  return;
                setWorkspaces(sampleWorkspaces());
                setChanges({});
                setPage("home");
                setModal(null);
                draftRef.current = null;
                setDraft({ ...blank });
                setMessage("Demo reset.");
              }}
            >
              <RotateCcw size={13} />
              Reset demo
            </button>
          </div>
          {message && (
            <div role="status" className="alert success">
              <CheckCircle2 size={18} />
              {message}
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {error && !modal && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          {page === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {staff ? "COMMUNITY AT A GLANCE" : "YOUR SPACE TO GROW"}
                  </div>
                  <h1>
                    {staff
                      ? "Good things start here."
                      : `Salaam, ${member.name.split(" ")[0]}`}
                    <span className="greeting-dot">.</span>
                  </h1>
                  <p>
                    {staff
                      ? "Bring your community together, one activity at a time."
                      : workspace.subtitle}
                  </p>
                </div>
                <label className="period-selector">
                  <CalendarDays size={17} />
                  <select
                    aria-label="Reporting period"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value="all">Autumn program</option>
                    <option value="recent">Since 12 October</option>
                  </select>
                  <ChevronDown size={15} />
                </label>
              </div>
              <div className="dashboard-grid">
                <div className="dashboard-primary">
                  <section className="progress-hero">
                    <div className="hero-copy">
                      <span className="hero-eyebrow">
                        {staff
                          ? "COMMUNITY CONTRIBUTIONS"
                          : "EVERY CONTRIBUTION COUNTS"}
                      </span>
                      <h2>
                        {staff
                          ? "A community that shows up."
                          : "You’re making a difference."}
                      </h2>
                      <p>
                        {staff
                          ? "Recognize the effort behind every activity."
                          : "A helping hand. A little time. A step forward."}
                      </p>
                      <div className="hero-stats">
                        <div>
                          <strong>
                            {staff
                              ? workspace.awards.reduce(
                                  (s, a) => s + a.amount,
                                  0,
                                )
                              : points}
                          </strong>
                          <span>contribution points</span>
                        </div>
                        <div className="hero-divider" />
                        <div>
                          <strong>
                            {staff
                              ? workspace.members.length
                              : awards.filter((a) => a.amount > 0).length}
                          </strong>
                          <span>
                            {staff ? "youth members" : "contributions"}
                          </span>
                        </div>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => go("progress")}
                      >
                        {staff ? "View members" : "See my progress"}
                        <ArrowRight size={17} />
                      </button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="leaf-art">
                        <Leaf size={105} strokeWidth={1.1} />
                      </div>
                      <span className="art-spark spark-one">✦</span>
                      <span className="art-spark spark-two">✧</span>
                    </div>
                  </section>
                  <div className="section-heading">
                    <div>
                      <h2>Coming up</h2>
                      <p>A chance to connect and take part.</p>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => go("activities")}
                    >
                      All activities
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="activity-grid">
                    {(staff ? workspace.activities : personalActivities)
                      .slice(0, 2)
                      .map((a, i) => (
                        <ActivityCard
                          key={a.id}
                          activity={a}
                          variant={i}
                          registered={a.registered.includes(member.id)}
                          onOpen={() =>
                            staff ? openCheckin(a) : openActivity(a)
                          }
                        />
                      ))}
                  </div>
                  <section className="history-card">
                    <div className="section-heading compact">
                      <h2>
                        {staff
                          ? "Recent recognition"
                          : "Your recent contributions"}
                      </h2>
                      <button
                        className="text-link"
                        onClick={() => go("progress")}
                      >
                        View all
                        <ArrowRight size={15} />
                      </button>
                    </div>
                    {(staff ? workspace.awards.slice().reverse() : awards)
                      .slice(0, 3)
                      .map((a) => (
                        <div key={a.id} className="history-row">
                          <span
                            className={`history-icon ${a.amount < 0 ? "correction" : ""}`}
                          >
                            <Check size={19} />
                          </span>
                          <div>
                            <strong>{a.reason}</strong>
                            <span>
                              {staff
                                ? `${workspace.members.find((m) => m.id === a.memberId)?.name} · `
                                : ""}
                              {dateLabel(a.date)} ·{" "}
                              {a.source === "correction"
                                ? "Correction"
                                : "Confirmed"}
                            </span>
                          </div>
                          <b className="award-number">
                            {a.amount > 0 ? "+" : ""}
                            {a.amount}
                            <small>pts</small>
                          </b>
                        </div>
                      ))}
                    {!workspace.awards.length && (
                      <div className="empty-inline">
                        Your community’s contributions will appear here.
                      </div>
                    )}
                  </section>
                </div>
                <aside className="dashboard-aside">
                  <section className="aside-card community-card">
                    <span className="outlined-icon">
                      <Users size={22} />
                    </span>
                    <div className="eyebrow">BETTER TOGETHER</div>
                    <h2>
                      Your people.
                      <br />
                      Your place.
                    </h2>
                    <p>
                      There’s more to your mosque than a place to meet. There’s
                      a community to grow with.
                    </p>
                    <div className="avatar-stack">
                      {workspace.members.slice(0, 4).map((m) => (
                        <span key={m.id}>{m.initials}</span>
                      ))}
                      <small>{workspace.members.length} young people</small>
                    </div>
                  </section>
                  {staff ? (
                    <section className="aside-card">
                      <h3>Make good things happen</h3>
                      <p>Plan an activity or recognize someone’s effort.</p>
                      <button
                        className="button primary full"
                        onClick={startCreate}
                      >
                        <Plus size={17} />
                        Create activity
                      </button>
                      <button
                        className="button secondary full"
                        onClick={showAward}
                      >
                        <Gift size={17} />
                        Give points
                      </button>
                    </section>
                  ) : workspace.futsal ? (
                    <section className="game-card">
                      <div className="game-topline">
                        <span>CONNECTED APP</span>
                        <ArrowUpRight size={18} />
                      </div>
                      <div className="pitch-art" aria-hidden="true">
                        <div />
                        <Trophy size={40} />
                      </div>
                      <h2>Himmah Futsal</h2>
                      <p>
                        Build your team.
                        <br />
                        Bring your community spirit.
                      </p>
                      <button onClick={() => go("apps")}>
                        Explore Futsal
                        <ArrowRight size={16} />
                      </button>
                      <span className="game-footnote">
                        Game experience coming next
                      </span>
                    </section>
                  ) : (
                    <section className="aside-card">
                      <Leaf size={25} />
                      <h3>Hub is all you need</h3>
                      <p>
                        Activities, attendance and recognition work without a
                        connected game.
                      </p>
                    </section>
                  )}
                  <div className="quiet-note">
                    <Leaf size={15} />
                    <p>
                      Progress is personal.
                      <br />
                      Every sincere effort matters.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
          {page === "activities" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">TAKE PART</div>
                  <h1>Something to look forward to.</h1>
                  <p>Find your next opportunity to connect and contribute.</p>
                </div>
                {staff && (
                  <button className="button primary" onClick={startCreate}>
                    <Plus size={18} />
                    Create activity
                  </button>
                )}
              </div>
              <div className="toolbar">
                <Search size={18} />
                <input
                  aria-label="Search activities"
                  placeholder="Find an activity…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span>
                  {(staff ? workspace.activities : personalActivities).length}{" "}
                  activities
                </span>
              </div>
              <div className="activity-grid listing">
                {(staff ? workspace.activities : personalActivities)
                  .filter((a) =>
                    a.title.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((a, i) => (
                    <ActivityCard
                      key={a.id}
                      activity={a}
                      variant={i}
                      registered={a.registered.includes(member.id)}
                      onOpen={() => (staff ? openCheckin(a) : openActivity(a))}
                    />
                  ))}
              </div>
              {!(staff ? workspace.activities : personalActivities).some((a) =>
                a.title.toLowerCase().includes(search.toLowerCase()),
              ) && (
                <Empty
                  title="No matching activities"
                  text="Try a different name or create a new activity in staff view."
                />
              )}
            </>
          )}
          {page === "progress" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {staff ? "MEMBERS & RECOGNITION" : "YOUR JOURNEY"}
                  </div>
                  <h1>
                    {staff
                      ? "Recognize the little things."
                      : "Every effort adds up."}
                  </h1>
                  <p>
                    {staff
                      ? "A contribution history, never a measure of someone’s worth."
                      : "Your attendance and contributions, all in one place."}
                  </p>
                </div>
                {staff && (
                  <button className="button primary" onClick={showAward}>
                    <Plus size={17} />
                    Give points
                  </button>
                )}
              </div>
              {staff ? (
                <div className="panel">
                  {workspace.members.map((m) => (
                    <div className="history-row" key={m.id}>
                      <span className="avatar">{m.initials}</span>
                      <div>
                        <strong>{m.name}</strong>
                        <span>{m.group}</span>
                      </div>
                      <b>{totalPoints(workspace, m.id)} pts</b>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <section className="stat-strip">
                    <div>
                      <span>Contribution points</span>
                      <strong>{totalPoints(workspace, member.id)}</strong>
                    </div>
                    <div>
                      <span>Activities attended</span>
                      <strong>
                        {
                          workspace.activities.filter(
                            (a) => a.attendance[member.id] === "present",
                          ).length
                        }
                      </strong>
                    </div>
                    <div>
                      <span>Your community</span>
                      <strong className="community-stat">
                        {workspace.name}
                      </strong>
                    </div>
                  </section>
                  <div className="tabs">
                    <button
                      className={progressTab === "points" ? "active" : ""}
                      onClick={() => setProgressTab("points")}
                    >
                      Point history
                    </button>
                    <button
                      className={progressTab === "attendance" ? "active" : ""}
                      onClick={() => setProgressTab("attendance")}
                    >
                      My attendance
                    </button>
                  </div>
                  <div className="panel">
                    {progressTab === "points" ? (
                      <>
                        {workspace.awards
                          .filter((a) => a.memberId === member.id)
                          .slice()
                          .reverse()
                          .map((a) => (
                            <div className="history-row" key={a.id}>
                              <span className="history-icon">
                                <Gift size={18} />
                              </span>
                              <div>
                                <strong>{a.reason}</strong>
                                <span>
                                  {dateLabel(a.date)} · {a.source}
                                </span>
                              </div>
                              <b>
                                {a.amount > 0 ? "+" : ""}
                                {a.amount} pts
                              </b>
                            </div>
                          ))}
                        {!workspace.awards.some(
                          (a) => a.memberId === member.id,
                        ) && (
                          <Empty
                            title="Your story starts here"
                            text="Confirmed contributions will appear here. No game or quiz needed."
                          />
                        )}
                      </>
                    ) : (
                      <>
                        {workspace.activities
                          .filter(
                            (a) =>
                              a.attendance[member.id] &&
                              a.attendance[member.id] !== "unmarked",
                          )
                          .map((a) => (
                            <div className="history-row" key={a.id}>
                              <CalendarDays size={20} />
                              <div>
                                <strong>{a.title}</strong>
                                <span>{dateLabel(a.date)}</span>
                              </div>
                              <span className="badge">
                                {a.attendance[member.id]}
                              </span>
                            </div>
                          ))}
                        {!workspace.activities.some(
                          (a) =>
                            a.attendance[member.id] &&
                            a.attendance[member.id] !== "unmarked",
                        ) && (
                          <Empty
                            title="No confirmed attendance yet"
                            text="Your volunteer will confirm attendance after an activity."
                          />
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          {page === "apps" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR CONNECTED APPS</div>
                  <h1>More ways to grow.</h1>
                  <p>
                    Your contributions stay in Hub. Connected games build on
                    them.
                  </p>
                </div>
              </div>
              <section className="panel app-detail">
                <div className="app-emblem">
                  <Trophy size={40} />
                </div>
                <div>
                  <span className="badge">
                    {workspace.futsal
                      ? "Included in this demo workspace"
                      : "Not licensed in this demo workspace"}
                  </span>
                  <h2>Himmah Futsal</h2>
                  <p>
                    Manage your own club or play for a team. Your community
                    contributions help your squad develop.
                  </p>
                  <p className="muted">
                    Futsal is planned, not playable yet. Both league and
                    tournament formats will be supported. All Hub features work
                    independently.
                  </p>
                </div>
              </section>
            </>
          )}
          {page === "checkin" && staff && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">VOLUNTEER CHECK-IN</div>
                  <h1>Good to see everyone.</h1>
                  <p>Confirm participation. Recognize the effort.</p>
                </div>
                <button className="button secondary" onClick={showAward}>
                  <Gift size={17} />
                  Give points
                </button>
              </div>
              <div className="panel checkin-header">
                <label>
                  Activity
                  <select
                    value={activity.id}
                    onChange={(e) => {
                      if (!canLeave()) return;
                      setActivityId(e.target.value);
                      setChanges({});
                      setSearch("");
                      setReason("");
                    }}
                  >
                    {workspace.activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} · {dateLabel(a.date)}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <MapPin size={16} />
                  {activity.location}
                </div>
                <span className="badge">
                  {pointLabels[activity.mode]}
                  {activity.mode === "attendance"
                    ? ` · ${activity.points} pts`
                    : ""}
                </span>
              </div>
              <div className="attendance-stats">
                {(
                  ["present", "absent", "excused", "unmarked"] as Attendance[]
                ).map((status) => (
                  <div key={status}>
                    <strong>
                      {
                        workspace.members.filter(
                          (m) =>
                            eligible(activity, m) &&
                            (activity.attendance[m.id] ?? "unmarked") ===
                              status,
                        ).length
                      }
                    </strong>
                    <span>{status}</span>
                  </div>
                ))}
              </div>
              <div className="toolbar">
                <Search size={18} />
                <input
                  aria-label="Search participants"
                  placeholder="Search participants…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="Filter attendance"
                  value={attendanceFilter}
                  onChange={(e) => setAttendanceFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  {["present", "absent", "excused", "unmarked"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="panel roster">
                <div className="roster-heading">
                  <strong>
                    Eligible youth ·{" "}
                    {
                      workspace.members.filter((m) => eligible(activity, m))
                        .length
                    }
                  </strong>
                  <button
                    className="text-link"
                    onClick={() => {
                      const visible = workspace.members.filter(
                        (m) =>
                          eligible(activity, m) &&
                          m.name.toLowerCase().includes(search.toLowerCase()) &&
                          (attendanceFilter === "all" ||
                            (activity.attendance[m.id] ?? "unmarked") ===
                              attendanceFilter),
                      );
                      setChanges((old) => {
                        const next = { ...old };
                        visible.forEach((m) => {
                          if (
                            (activity.attendance[m.id] ?? "unmarked") !==
                            "present"
                          )
                            next[m.id] = "present";
                          else delete next[m.id];
                        });
                        return next;
                      });
                    }}
                  >
                    Mark visible present
                  </button>
                </div>
                {workspace.members
                  .filter(
                    (m) =>
                      eligible(activity, m) &&
                      m.name.toLowerCase().includes(search.toLowerCase()) &&
                      (attendanceFilter === "all" ||
                        (activity.attendance[m.id] ?? "unmarked") ===
                          attendanceFilter),
                  )
                  .map((m) => (
                    <div className="roster-row" key={m.id}>
                      <span className="avatar">{m.initials}</span>
                      <div className="roster-person">
                        <strong>{m.name}</strong>
                        <span>
                          {activity.registered.includes(m.id)
                            ? "Registered"
                            : "Eligible walk-in"}{" "}
                          · Saved: {activity.attendance[m.id] ?? "unmarked"}
                        </span>
                        {changes[m.id] && (
                          <small className="unsaved">Not saved</small>
                        )}
                      </div>
                      <div
                        className="attendance-picker"
                        role="group"
                        aria-label={`Attendance for ${m.name}`}
                      >
                        {(
                          [
                            "present",
                            "absent",
                            "excused",
                            "unmarked",
                          ] as Attendance[]
                        ).map((status) => (
                          <button
                            aria-pressed={
                              (changes[m.id] ??
                                activity.attendance[m.id] ??
                                "unmarked") === status
                            }
                            className={
                              (changes[m.id] ??
                                activity.attendance[m.id] ??
                                "unmarked") === status
                                ? "active"
                                : ""
                            }
                            key={status}
                            onClick={() =>
                              setChanges((old) => {
                                const next = { ...old };
                                if (
                                  status ===
                                  (activity.attendance[m.id] ?? "unmarked")
                                )
                                  delete next[m.id];
                                else next[m.id] = status;
                                return next;
                              })
                            }
                          >
                            {status === "present" && <Check size={13} />}
                            <span>{status}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
              <div className="save-bar">
                <div>
                  <strong>
                    {changeCount} unsaved{" "}
                    {changeCount === 1 ? "change" : "changes"}
                  </strong>
                  <p>Registration is separate from attendance.</p>
                </div>
                <button
                  className="button primary"
                  disabled={!changeCount}
                  onClick={() => {
                    setReason("");
                    setModal("review");
                    clearFeedback();
                  }}
                >
                  Review changes
                  <ArrowRight size={17} />
                </button>
              </div>
            </>
          )}
          {page === "create" && staff && (
            <>
              <button
                className="text-link back-link"
                onClick={() => go("activities")}
              >
                <ArrowLeft size={16} />
                Activities
              </button>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">BRING PEOPLE TOGETHER</div>
                  <h1>A little planning. A lot of good.</h1>
                  <p>Create an activity that fits your community.</p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    draftRef.current = { ...draft };
                    setDraftSaved(true);
                    setMessage(
                      "Draft saved for this demo session. Refreshing resets sample data.",
                    );
                  }}
                >
                  Save draft
                </button>
              </div>
              <div className="wizard-layout">
                <div className="panel wizard">
                  <ol className="wizard-steps">
                    {["Details", "Schedule", "Points", "Review"].map((s, i) => (
                      <li
                        key={s}
                        className={
                          step === i ? "active" : step > i ? "complete" : ""
                        }
                      >
                        <span>{step > i ? <Check size={13} /> : i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                  {step === 0 && (
                    <>
                      <h2>What are we doing?</h2>
                      <p className="muted">
                        Give your activity a name and a welcoming introduction.
                      </p>
                      <label>
                        Activity name
                        <input
                          autoComplete="off"
                          value={draft.title}
                          onChange={(e) => field("title", e.target.value)}
                          placeholder="e.g. Community lunch helpers"
                          maxLength={100}
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          value={draft.description}
                          onChange={(e) => field("description", e.target.value)}
                          placeholder="What can young people expect?"
                          maxLength={1000}
                        />
                      </label>
                      <label>
                        Location
                        <input
                          value={draft.location}
                          onChange={(e) => field("location", e.target.value)}
                          placeholder="e.g. Community hall"
                          maxLength={150}
                        />
                      </label>
                      <label>
                        Who can join?
                        <select
                          value={draft.group}
                          onChange={(e) => field("group", e.target.value)}
                        >
                          {groups.map((g) => (
                            <option key={g}>{g}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  {step === 1 && (
                    <>
                      <h2>Make time for good.</h2>
                      <p className="muted">
                        One-off activities in this first prototype. Times use
                        Europe/London.
                      </p>
                      <label>
                        Date
                        <input
                          type="date"
                          value={draft.date}
                          onChange={(e) => field("date", e.target.value)}
                        />
                      </label>
                      <div className="form-two">
                        <label>
                          Starts
                          <input
                            type="time"
                            value={draft.time}
                            onChange={(e) => field("time", e.target.value)}
                          />
                        </label>
                        <label>
                          Ends
                          <input
                            type="time"
                            value={draft.endTime}
                            onChange={(e) => field("endTime", e.target.value)}
                          />
                        </label>
                      </div>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={draft.registration}
                          onChange={(e) =>
                            field("registration", e.target.checked)
                          }
                        />
                        Ask participants to register
                      </label>
                      {draft.registration && (
                        <label>
                          Places available
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={draft.capacity || ""}
                            onChange={(e) =>
                              field("capacity", Number(e.target.value))
                            }
                          />
                        </label>
                      )}
                      <div className="info-note">
                        Recurring activities will follow after the one-off
                        workflow is verified.
                      </div>
                    </>
                  )}
                  {step === 2 && (
                    <>
                      <h2>Your activity. Your rules.</h2>
                      <p className="muted">
                        Attendance and points are independent. No quiz or game
                        required.
                      </p>
                      {(
                        [
                          {
                            id: "none",
                            title: "No points",
                            text: "Track attendance only. Participation is enough.",
                          },
                          {
                            id: "attendance",
                            title: "Automatic attendance award",
                            text: "Award once when a volunteer confirms presence.",
                          },
                          {
                            id: "custom",
                            title: "Staff-approved contribution",
                            text: "Recognize a custom task using manual approval.",
                          },
                          {
                            id: "manual",
                            title: "Manual awards only",
                            text: "Volunteers choose who earns points and why.",
                          },
                        ] as const
                      ).map((option) => (
                        <label
                          className={`point-option ${draft.mode === option.id ? "selected" : ""}`}
                          key={option.id}
                        >
                          <input
                            type="radio"
                            name="points-mode"
                            checked={draft.mode === option.id}
                            onChange={() => field("mode", option.id)}
                          />
                          <span>
                            <strong>{option.title}</strong>
                            <small>{option.text}</small>
                          </span>
                        </label>
                      ))}
                      {["attendance", "custom"].includes(draft.mode) && (
                        <label>
                          Points per contribution
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={draft.points || ""}
                            onChange={(e) =>
                              field("points", Number(e.target.value))
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <h2>Ready to bring people together?</h2>
                      <p className="muted">
                        Here’s what participants will see.
                      </p>
                      <div className="preview-activity">
                        <span className="badge">{draft.group}</span>
                        <h2>{draft.title}</h2>
                        <p>
                          {draft.description ||
                            "Join your community for this activity."}
                        </p>
                        <p>
                          <CalendarDays size={16} />
                          {dateLabel(draft.date)} · {draft.time}–{draft.endTime}
                        </p>
                        <p>
                          <MapPin size={16} />
                          {draft.location}
                        </p>
                        <div className="info-note">
                          {draft.mode === "attendance"
                            ? `${draft.points} points after confirmed attendance.`
                            : draft.mode === "none"
                              ? "Attendance only. No points awarded."
                              : draft.mode === "custom"
                                ? `${draft.points} points after staff approval. Use Give points to approve in this prototype.`
                                : "Points may be awarded manually by a volunteer."}
                        </div>
                      </div>
                      <p className="hint">
                        {draft.registration
                          ? `Registration enabled · ${draft.capacity} places.`
                          : "No registration required."}{" "}
                        This is a sample activity, visible in this demo session
                        only.
                      </p>
                    </>
                  )}
                  <div className="wizard-footer">
                    <button
                      className="button secondary"
                      disabled={step === 0}
                      onClick={() => {
                        setStep(step - 1);
                        clearFeedback();
                      }}
                    >
                      Back
                    </button>
                    {step < 3 ? (
                      <button className="button primary" onClick={nextStep}>
                        Continue
                        <ArrowRight size={16} />
                      </button>
                    ) : (
                      <button
                        className="button primary"
                        onClick={() =>
                          attempt(() => {
                            const next = publishActivity(
                              workspace,
                              draft,
                              crypto.randomUUID(),
                            );
                            update(() => next);
                            setDraft({ ...blank });
                            draftRef.current = null;
                            setDraftSaved(true);
                            setPage("activities");
                            setMessage(
                              "Activity published in this demo. You can now check in participants.",
                            );
                          })
                        }
                      >
                        Publish activity
                        <Check size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <aside className="aside-card setup-aside">
                  <span className="outlined-icon">
                    <Leaf size={24} />
                  </span>
                  <h3>A space for every kind of good.</h3>
                  <p>Helping set up. Learning together. Simply showing up.</p>
                  <p>Your community decides what to recognize.</p>
                  <div className="aside-divider" />
                  <p className="hint">
                    Hub contributions remain in Hub. Games apply their own
                    training rules.
                  </p>
                </aside>
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={14} />
              Himmah · Grow together.
            </span>
            <span>Prototype · Fictional members · Resets on refresh</span>
          </footer>
        </main>
        <nav className="mobile-nav">
          {menu.slice(0, 4).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {modal === "activity" &&
        openModal(
          <>
            <div className="activity-dialog-art">
              <CalendarDays size={46} />
              <span>{dateLabel(activity.date)}</span>
            </div>
            <p>{activity.description}</p>
            <div className="detail-lines">
              <span>
                <Clock3 size={17} />
                {activity.time}–{activity.endTime} · Europe/London
              </span>
              <span>
                <MapPin size={17} />
                {activity.location}
              </span>
              <span>
                <Users size={17} />
                {activity.group}
              </span>
            </div>
            <div className="info-note">
              {activity.mode === "attendance"
                ? `${activity.points} points after confirmed attendance. Registration does not award points.`
                : activity.mode === "none"
                  ? "No points are awarded for this activity."
                  : "Contributions are recognized through volunteer-approved manual awards."}
            </div>
            {activity.registration ? (
              <>
                <p className="hint">
                  {activity.capacity - activity.registered.length} places
                  available
                </p>
                <button
                  className="button primary full"
                  disabled={
                    !activity.registered.includes(member.id) &&
                    activity.registered.length >= activity.capacity
                  }
                  onClick={() =>
                    attempt(() => {
                      const next = register(workspace, activity.id, member.id);
                      update(() => next);
                      setMessage(
                        activity.registered.includes(member.id)
                          ? "Registration cancelled."
                          : "You’re registered. See you there!",
                      );
                      setModal(null);
                    })
                  }
                >
                  {activity.registered.includes(member.id)
                    ? "Cancel registration"
                    : activity.registered.length >= activity.capacity
                      ? "Activity full"
                      : "Count me in"}
                  <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <p className="hint">No registration needed. Just come along.</p>
            )}
          </>,
          activity.title,
        )}
      {modal === "review" &&
        openModal(
          <>
            <p>
              Confirm {changeCount} attendance{" "}
              {changeCount === 1 ? "change" : "changes"} for{" "}
              <strong>{activity.title}</strong>.
            </p>
            <div className="review-list">
              {Object.entries(changes).map(([id, status]) => (
                <div className="review-row" key={id}>
                  <strong>
                    {workspace.members.find((m) => m.id === id)?.name}
                  </strong>
                  <span>
                    {activity.attendance[id] ?? "unmarked"} → <b>{status}</b>
                  </span>
                </div>
              ))}
            </div>
            <div className="info-note">
              {activity.mode === "attendance"
                ? `Confirmed presence earns ${activity.points} points per member. Changing presence reverses only linked attendance points.`
                : "No automatic points. Manual awards are recorded separately."}
            </div>
            <label>
              Correction reason{" "}
              {Object.keys(changes).some(
                (id) => (activity.attendance[id] ?? "unmarked") !== "unmarked",
              )
                ? "(required)"
                : "(optional)"}
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is saved attendance changing?"
                maxLength={200}
              />
            </label>
            <button className="button primary full" onClick={commitAttendance}>
              <Check size={17} />
              Confirm and save
            </button>
          </>,
          "Review attendance",
        )}
      {modal === "award" &&
        openModal(
          <form onSubmit={submitAward}>
            {previewAward ? (
              <>
                <p>
                  Give <strong>{awardAmount} points each</strong> to{" "}
                  {awardMembers.length} members.
                </p>
                <div className="review-list">
                  {awardMembers.map((id) => (
                    <div key={id} className="review-row">
                      <strong>
                        {workspace.members.find((m) => m.id === id)?.name}
                      </strong>
                      <span>+{awardAmount} points</span>
                    </div>
                  ))}
                </div>
                <p>
                  <strong>Reason:</strong> {awardReason}
                </p>
                <div className="info-note">
                  {awardAmount * awardMembers.length} total points. This
                  recognizes contributions; it does not change football match
                  results.
                </div>
                <button
                  type="button"
                  className="button secondary full"
                  onClick={() => setPreviewAward(false)}
                >
                  Edit recipients or amount
                </button>
              </>
            ) : (
              <>
                <p>
                  Recognize the good your community is doing. No activity or
                  game season required.
                </p>
                <fieldset className="member-checks">
                  <legend>Recipients</legend>
                  {workspace.members.map((m) => (
                    <label key={m.id}>
                      <input
                        type="checkbox"
                        checked={awardMembers.includes(m.id)}
                        onChange={(e) =>
                          setAwardMembers((old) =>
                            e.target.checked
                              ? [...old, m.id]
                              : old.filter((id) => id !== m.id),
                          )
                        }
                      />
                      {m.name}
                      <small>{m.group}</small>
                    </label>
                  ))}
                </fieldset>
                <label>
                  Points per member
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={awardAmount || ""}
                    onChange={(e) => setAwardAmount(Number(e.target.value))}
                  />
                </label>
                <label>
                  What are you recognizing?
                  <input
                    required
                    maxLength={200}
                    placeholder="e.g. Helped prepare the community lunch"
                    value={awardReason}
                    onChange={(e) => setAwardReason(e.target.value)}
                  />
                </label>
              </>
            )}
            <button className="button primary full" type="submit">
              {previewAward ? "Confirm awards" : "Review awards"}
              <ArrowRight size={17} />
            </button>
          </form>,
          "Give a little recognition",
        )}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <Leaf size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function ActivityCard({
  activity: a,
  variant,
  registered,
  onOpen,
}: {
  activity: Activity;
  variant: number;
  registered: boolean;
  onOpen: () => void;
}) {
  return (
    <article className="activity-card">
      <div className={`activity-art art-${variant % 3}`} aria-hidden="true">
        <div className="art-circle" />
        <div className="art-lines" />
        {variant % 3 === 0 ? (
          <Users size={65} strokeWidth={1.2} />
        ) : variant % 3 === 1 ? (
          <Leaf size={69} strokeWidth={1.2} />
        ) : (
          <Trophy size={64} strokeWidth={1.2} />
        )}
        <span className="activity-date">
          <b>{new Date(`${a.date}T12:00:00Z`).getUTCDate()}</b>
          {new Date(`${a.date}T12:00:00Z`).toLocaleDateString("en-GB", {
            month: "short",
            timeZone: "UTC",
          })}
        </span>
      </div>
      <div className="activity-card-content">
        <div className="activity-card-meta">
          <span>
            {a.time}–{a.endTime}
          </span>
          <span className={`mini-badge ${registered ? "registered" : ""}`}>
            {registered
              ? "Registered"
              : a.mode === "attendance"
                ? `+${a.points} pts`
                : a.mode === "none"
                  ? "Just take part"
                  : "Volunteer approved"}
          </span>
        </div>
        <h3>{a.title}</h3>
        <p>{a.description}</p>
        <div className="activity-card-bottom">
          <span>
            <MapPin size={14} />
            {a.location.split(" · ")[0]}
          </span>
          <button onClick={onOpen} aria-label={`View ${a.title}`}>
            <ArrowUpRight size={20} />
          </button>
        </div>
      </div>
    </article>
  );
}
