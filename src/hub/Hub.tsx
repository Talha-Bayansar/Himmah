import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Link, useBlocker } from "@tanstack/react-router";
import {
  useForm,
  useStore,
  type DeepKeys,
  type DeepValue,
} from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Dialog as ShadcnDialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ActionButton } from "@/components/shared/action-button";
import { useConfirmation } from "@/components/shared/confirmation";
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
  return (
    <ShadcnDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="hub-dialog" showCloseButton={false}>
        <div className="dialog-heading">
          <DialogTitle>{title}</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={21} />
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Review the details and confirm your action.
        </DialogDescription>
        {children}
      </DialogContent>
    </ShadcnDialog>
  );
}

export default function Hub() {
  const confirm = useConfirmation();

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
  const activityForm = useForm({
    defaultValues: { ...blank },
    onSubmit: async () => {
      attempt(() => {
        const next = publishActivity(
          workspace,
          activityForm.state.values,
          crypto.randomUUID(),
        );
        update(() => next);
        activityForm.reset({ ...blank });
        draftRef.current = null;
        setDraftSaved(true);
        setPage("activities");
        setMessage(
          "Activity published in this demo. You can now check in participants.",
        );
      });
    },
  });
  const draft = useStore(activityForm.store, (state) => state.values);
  const publishPending = useStore(
    activityForm.store,
    (state) => state.isSubmitting,
  );
  const setDraft = (value: ActivityDraft) => activityForm.reset(value);
  const awardForm = useForm({
    defaultValues: { members: [] as string[], amount: 10, reason: "" },
    onSubmit: async () => submitAward(),
  });
  const awardMembers = useStore(
    awardForm.store,
    (state) => state.values.members,
  );
  const awardAmount = useStore(awardForm.store, (state) => state.values.amount);
  const awardReason = useStore(awardForm.store, (state) => state.values.reason);
  const awardPending = useStore(awardForm.store, (state) => state.isSubmitting);
  const setAwardMembers = (next: string[] | ((old: string[]) => string[])) =>
    awardForm.setFieldValue(
      "members",
      typeof next === "function" ? next(awardForm.state.values.members) : next,
    );
  const setAwardAmount = (value: number) =>
    awardForm.setFieldValue("amount", value);
  const setAwardReason = (value: string) =>
    awardForm.setFieldValue("reason", value);
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
  useBlocker({
    shouldBlockFn: async () => !(await canLeave()),
    enableBeforeUnload: dirty,
  });
  function clearFeedback() {
    setError("");
    setMessage("");
  }
  async function canLeave() {
    return (
      !dirty ||
      (await confirm({
        title: "Discard unsaved changes?",
        description: "Your unsaved attendance or activity edits will be lost.",
        confirmLabel: "Discard changes",
        destructive: true,
      }))
    );
  }
  async function go(next: Page) {
    if (!(await canLeave())) return;
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
  async function changeWorkspace(id: string) {
    if (!(await canLeave())) return;
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
  async function openCheckin(a: Activity) {
    if (!(await canLeave())) return;
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
  async function startCreate() {
    if (!(await canLeave())) return;
    setDraft(draftRef.current ?? { ...blank });
    setDraftSaved(false);
    setStep(0);
    setPage("create");
    clearFeedback();
  }
  function field<K extends DeepKeys<ActivityDraft>>(
    key: K,
    value: DeepValue<ActivityDraft, K>,
  ) {
    activityForm.setFieldValue(key, value);
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
  function submitAward() {
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
          <NativeSelect
            aria-label="Workspace"
            value={workspaceId}
            onChange={(e) => changeWorkspace(e.target.value)}
          >
            {workspaces.map((w) => (
              <NativeSelectOption key={w.id} value={w.id}>
                {w.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <div className="sidebar-section">
          {staff ? "YOUR WORKSPACE" : "YOUR SPACE"}
        </div>
        <nav>
          {menu.map((item) => (
            <Button
              variant="ghost"
              key={item.id}
              className={`nav-item ${page === item.id ? "selected" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              <item.icon size={20} />
              {item.label}
              {page === item.id && <span className="nav-dot" />}
            </Button>
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
          <Button
            variant="ghost"
            className="view-switch"
            onClick={async () => {
              if (!(await canLeave())) return;
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
          </Button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <IconMark />
            <strong>himmah</strong>
          </div>
          <div className="breadcrumb">
            <Link to="/">Himmah</Link> <span>/</span>{" "}
            <strong>Himmah Hub</strong>
          </div>
          <div className="topbar-right">
            <Link to="/start" className="register-org-link">
              Register your organization →
            </Link>
            <span className="demo-pill">
              <span />
              Interactive demo
            </span>
            <label className="member-select">
              <span className="sr-only">Preview member</span>
              <NativeSelect
                value={member.id}
                onChange={async (e) => {
                  if (!(await canLeave())) return;
                  setMemberId(e.target.value);
                  setChanges({});
                  clearFeedback();
                }}
              >
                {workspace.members.map((m) => (
                  <NativeSelectOption key={m.id} value={m.id}>
                    {m.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <span className="avatar small">
              {staff ? "V" : member.initials}
            </span>
          </div>
        </header>
        <div className="mobile-controls">
          <Link to="/start" className="register-org-link">
            Your organization →
          </Link>
          <NativeSelect
            aria-label="Mobile workspace"
            value={workspaceId}
            onChange={(e) => changeWorkspace(e.target.value)}
          >
            {workspaces.map((w) => (
              <NativeSelectOption key={w.id} value={w.id}>
                {w.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            variant="ghost"
            onClick={async () => {
              if (!(await canLeave())) return;
              setStaff(!staff);
              setChanges({});
              setPage("home");
            }}
          >
            {staff ? "Youth view" : "Staff view"}
          </Button>
        </div>
        <main>
          <div className="prototype-note">
            <span>
              Sample workspace · Try the youth and staff views. Changes reset on
              refresh.
            </span>
            <Button
              variant="ghost"
              onClick={async () => {
                if (
                  !(await confirm({
                    title: "Reset the demo?",
                    description:
                      "All sample activities, attendance and points will return to their starting values. This cannot be undone.",
                    confirmLabel: "Reset demo",
                    destructive: true,
                  }))
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
            </Button>
          </div>
          {message && (
            <div role="status" className="alert success">
              <CheckCircle2 size={18} />
              {message}
              <Button
                variant="ghost"
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                <X size={16} />
              </Button>
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
                      ? "See upcoming activities, check attendance and recognise contributions."
                      : workspace.subtitle}
                  </p>
                </div>
                <label className="period-selector">
                  <CalendarDays size={17} />
                  <NativeSelect
                    aria-label="Reporting period"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <NativeSelectOption value="all">
                      Autumn program
                    </NativeSelectOption>
                    <NativeSelectOption value="recent">
                      Since 12 October
                    </NativeSelectOption>
                  </NativeSelect>
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
                      <Button
                        variant="ghost"
                        className="text-link"
                        onClick={() => go("progress")}
                      >
                        {staff ? "View members" : "See my progress"}
                        <ArrowRight size={17} />
                      </Button>
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
                    <Button
                      variant="ghost"
                      className="text-link"
                      onClick={() => go("activities")}
                    >
                      All activities
                      <ArrowRight size={16} />
                    </Button>
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
                      <Button
                        variant="ghost"
                        className="text-link"
                        onClick={() => go("progress")}
                      >
                        View all
                        <ArrowRight size={15} />
                      </Button>
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
                      <Button
                        variant="ghost"
                        className="button primary full"
                        onClick={startCreate}
                      >
                        <Plus size={17} />
                        Create activity
                      </Button>
                      <Button
                        variant="ghost"
                        className="button secondary full"
                        onClick={showAward}
                      >
                        <Gift size={17} />
                        Give points
                      </Button>
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
                      <Button variant="ghost" onClick={() => go("apps")}>
                        Explore Futsal
                        <ArrowRight size={16} />
                      </Button>
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
                  <p>See what’s coming up and book your place.</p>
                </div>
                {staff && (
                  <Button
                    variant="ghost"
                    className="button primary"
                    onClick={startCreate}
                  >
                    <Plus size={18} />
                    Create activity
                  </Button>
                )}
              </div>
              <div className="toolbar">
                <Search size={18} />
                <Input
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
                  <Button
                    variant="ghost"
                    className="button primary"
                    onClick={showAward}
                  >
                    <Plus size={17} />
                    Give points
                  </Button>
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
                    <Button
                      variant="ghost"
                      className={progressTab === "points" ? "active" : ""}
                      onClick={() => setProgressTab("points")}
                    >
                      Point history
                    </Button>
                    <Button
                      variant="ghost"
                      className={progressTab === "attendance" ? "active" : ""}
                      onClick={() => setProgressTab("attendance")}
                    >
                      My attendance
                    </Button>
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
                  <p>
                    Mark attendance, review your changes and save the roster.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="button secondary"
                  onClick={showAward}
                >
                  <Gift size={17} />
                  Give points
                </Button>
              </div>
              <div className="panel checkin-header">
                <label>
                  Activity
                  <NativeSelect
                    value={activity.id}
                    onChange={async (e) => {
                      if (!(await canLeave())) return;
                      setActivityId(e.target.value);
                      setChanges({});
                      setSearch("");
                      setReason("");
                    }}
                  >
                    {workspace.activities.map((a) => (
                      <NativeSelectOption key={a.id} value={a.id}>
                        {a.title} · {dateLabel(a.date)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
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
                <Input
                  aria-label="Search participants"
                  placeholder="Search participants…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <NativeSelect
                  aria-label="Filter attendance"
                  value={attendanceFilter}
                  onChange={(e) => setAttendanceFilter(e.target.value)}
                >
                  <NativeSelectOption value="all">
                    All statuses
                  </NativeSelectOption>
                  {["present", "absent", "excused", "unmarked"].map((s) => (
                    <NativeSelectOption key={s}>{s}</NativeSelectOption>
                  ))}
                </NativeSelect>
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
                  <Button
                    variant="ghost"
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
                  </Button>
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
                          <Button
                            variant="ghost"
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
                          </Button>
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
                <Button
                  variant="ghost"
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
                </Button>
              </div>
            </>
          )}
          {page === "create" && staff && (
            <>
              <Button
                variant="ghost"
                className="text-link back-link"
                onClick={() => go("activities")}
              >
                <ArrowLeft size={16} />
                Activities
              </Button>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">BRING PEOPLE TOGETHER</div>
                  <h1>A little planning. A lot of good.</h1>
                  <p>
                    Set the details, choose who can join and decide how points
                    are awarded.
                  </p>
                </div>
                <Button
                  variant="ghost"
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
                </Button>
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
                        <Input
                          autoComplete="off"
                          value={draft.title}
                          onChange={(e) => field("title", e.target.value)}
                          placeholder="e.g. Community lunch helpers"
                          maxLength={100}
                        />
                      </label>
                      <label>
                        Description
                        <Textarea
                          value={draft.description}
                          onChange={(e) => field("description", e.target.value)}
                          placeholder="What can young people expect?"
                          maxLength={1000}
                        />
                      </label>
                      <label>
                        Location
                        <Input
                          value={draft.location}
                          onChange={(e) => field("location", e.target.value)}
                          placeholder="e.g. Community hall"
                          maxLength={150}
                        />
                      </label>
                      <label>
                        Who can join?
                        <NativeSelect
                          value={draft.group}
                          onChange={(e) => field("group", e.target.value)}
                        >
                          {groups.map((g) => (
                            <NativeSelectOption key={g}>{g}</NativeSelectOption>
                          ))}
                        </NativeSelect>
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
                        <Input
                          type="date"
                          value={draft.date}
                          onChange={(e) => field("date", e.target.value)}
                        />
                      </label>
                      <div className="form-two">
                        <label>
                          Starts
                          <Input
                            type="time"
                            value={draft.time}
                            onChange={(e) => field("time", e.target.value)}
                          />
                        </label>
                        <label>
                          Ends
                          <Input
                            type="time"
                            value={draft.endTime}
                            onChange={(e) => field("endTime", e.target.value)}
                          />
                        </label>
                      </div>
                      <label
                        className="checkbox-label"
                        htmlFor="activity-registration"
                      >
                        <Checkbox
                          id="activity-registration"
                          checked={draft.registration}
                          onCheckedChange={(value) =>
                            field("registration", value === true)
                          }
                        />
                        Ask participants to register
                      </label>
                      {draft.registration && (
                        <label>
                          Places available
                          <Input
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
                      <RadioGroup
                        value={draft.mode}
                        onValueChange={(value) =>
                          field("mode", value as ActivityDraft["mode"])
                        }
                        aria-label="Points policy"
                      >
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
                            htmlFor={`points-${option.id}`}
                          >
                            <RadioGroupItem
                              id={`points-${option.id}`}
                              value={option.id}
                            />
                            <span>
                              <strong>{option.title}</strong>
                              <small>{option.text}</small>
                            </span>
                          </label>
                        ))}
                      </RadioGroup>
                      {["attendance", "custom"].includes(draft.mode) && (
                        <label>
                          Points per contribution
                          <Input
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
                    <Button
                      variant="ghost"
                      className="button secondary"
                      disabled={step === 0}
                      onClick={() => {
                        setStep(step - 1);
                        clearFeedback();
                      }}
                    >
                      Back
                    </Button>
                    {step < 3 ? (
                      <Button
                        variant="ghost"
                        className="button primary"
                        onClick={nextStep}
                      >
                        Continue
                        <ArrowRight size={16} />
                      </Button>
                    ) : (
                      <ActionButton
                        className="button primary"
                        pending={publishPending}
                        onClick={() => activityForm.handleSubmit()}
                      >
                        Publish activity
                        <Check size={16} />
                      </ActionButton>
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
            <Button
              variant="ghost"
              key={item.id}
              className={page === item.id ? "active" : ""}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Button>
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
                <Button
                  variant="ghost"
                  className="button primary full"
                  disabled={
                    !activity.registered.includes(member.id) &&
                    activity.registered.length >= activity.capacity
                  }
                  onClick={async () => {
                    if (
                      activity.registered.includes(member.id) &&
                      !(await confirm({
                        title: "Cancel registration?",
                        description:
                          "Your place will become available to someone else.",
                        confirmLabel: "Cancel registration",
                        destructive: true,
                      }))
                    )
                      return;
                    attempt(() => {
                      const next = register(workspace, activity.id, member.id);
                      update(() => next);
                      setMessage(
                        activity.registered.includes(member.id)
                          ? "Registration cancelled."
                          : "You’re registered. See you there!",
                      );
                      setModal(null);
                    });
                  }}
                >
                  {activity.registered.includes(member.id)
                    ? "Cancel registration"
                    : activity.registered.length >= activity.capacity
                      ? "Activity full"
                      : "Count me in"}
                  <ArrowRight size={17} />
                </Button>
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
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is saved attendance changing?"
                maxLength={200}
              />
            </label>
            <Button
              variant="ghost"
              className="button primary full"
              onClick={commitAttendance}
            >
              <Check size={17} />
              Confirm and save
            </Button>
          </>,
          "Review attendance",
        )}
      {modal === "award" &&
        openModal(
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void awardForm.handleSubmit();
            }}
          >
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
                <Button
                  variant="ghost"
                  type="button"
                  className="button secondary full"
                  onClick={() => setPreviewAward(false)}
                >
                  Edit recipients or amount
                </Button>
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
                    <label key={m.id} htmlFor={`award-${m.id}`}>
                      <Checkbox
                        id={`award-${m.id}`}
                        checked={awardMembers.includes(m.id)}
                        onCheckedChange={(checked) =>
                          setAwardMembers((old) =>
                            checked === true
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
                  <Input
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
                  <Input
                    required
                    maxLength={200}
                    placeholder="e.g. Helped prepare the community lunch"
                    value={awardReason}
                    onChange={(e) => setAwardReason(e.target.value)}
                  />
                </label>
              </>
            )}
            <ActionButton
              className="button primary full"
              type="submit"
              pending={awardPending}
            >
              {previewAward ? "Confirm awards" : "Review awards"}
              <ArrowRight size={17} />
            </ActionButton>
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
          <Button
            variant="ghost"
            onClick={onOpen}
            aria-label={`View ${a.title}`}
          >
            <ArrowUpRight size={20} />
          </Button>
        </div>
      </div>
    </article>
  );
}
