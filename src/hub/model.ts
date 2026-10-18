export type Attendance = "unmarked" | "present" | "absent" | "excused";
export type PointMode = "none" | "attendance" | "manual" | "custom";
export interface Member {
  id: string;
  name: string;
  initials: string;
  group: string;
}
export interface Activity {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  endTime: string;
  group: string;
  mode: PointMode;
  points: number;
  registration: boolean;
  capacity: number;
  registered: string[];
  attendance: Record<string, Attendance>;
  revision: number;
}
export interface Award {
  id: string;
  memberId: string;
  amount: number;
  reason: string;
  date: string;
  activityId?: string;
  source: "attendance" | "manual" | "correction";
  linkedId?: string;
  staffReason?: string;
}
export interface Workspace {
  id: string;
  name: string;
  subtitle: string;
  futsal: boolean;
  members: Member[];
  activities: Activity[];
  awards: Award[];
  operations: string[];
}
export interface ActivityDraft {
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  endTime: string;
  group: string;
  mode: PointMode;
  points: number;
  registration: boolean;
  capacity: number;
}
export const groups = ["All youth", "Youth 11–13", "Youth 14–15"];
export function sampleWorkspaces(): Workspace[] {
  const members: Member[] = [
    { id: "yusuf", name: "Yusuf A.", initials: "YA", group: "Youth 11–13" },
    { id: "adam", name: "Adam K.", initials: "AK", group: "Youth 11–13" },
    { id: "bilal", name: "Bilal M.", initials: "BM", group: "Youth 14–15" },
    { id: "omar", name: "Omar H.", initials: "OH", group: "Youth 14–15" },
    { id: "ilyas", name: "Ilyas R.", initials: "IR", group: "Youth 11–13" },
    { id: "hamza", name: "Hamza S.", initials: "HS", group: "Youth 14–15" },
  ];
  return [
    {
      id: "crescent",
      name: "Crescent Youth",
      subtitle: "A little effort. A lasting difference.",
      futsal: true,
      members,
      activities: [
        {
          id: "youth-evening",
          title: "Friday youth evening",
          description:
            "Good company, a short reminder and a team challenge. Come as you are.",
          location: "Youth room · Main building",
          date: "2026-10-23",
          time: "18:00",
          endTime: "20:00",
          group: "All youth",
          mode: "attendance",
          points: 10,
          registration: true,
          capacity: 20,
          registered: ["adam", "bilal", "omar"],
          attendance: { adam: "present", bilal: "excused" },
          revision: 0,
        },
        {
          id: "community",
          title: "Make room for good",
          description:
            "Help prepare the hall for our community lunch. Every pair of hands helps.",
          location: "Community hall",
          date: "2026-10-25",
          time: "11:00",
          endTime: "12:30",
          group: "All youth",
          mode: "manual",
          points: 0,
          registration: true,
          capacity: 12,
          registered: [],
          attendance: {},
          revision: 0,
        },
        {
          id: "football",
          title: "Sunday kickabout",
          description:
            "A friendly game and a chance to catch up. No experience needed.",
          location: "Local sports court",
          date: "2026-10-25",
          time: "15:00",
          endTime: "16:30",
          group: "All youth",
          mode: "none",
          points: 0,
          registration: false,
          capacity: 0,
          registered: [],
          attendance: {},
          revision: 0,
        },
      ],
      awards: [
        {
          id: "seed-1",
          memberId: "yusuf",
          amount: 15,
          reason: "Helped prepare the hall",
          date: "2026-10-16",
          source: "manual",
        },
        {
          id: "seed-2",
          memberId: "yusuf",
          amount: 10,
          reason: "Youth evening",
          date: "2026-10-09",
          source: "manual",
        },
        {
          id: "seed-3",
          memberId: "yusuf",
          amount: 20,
          reason: "Community lunch volunteer",
          date: "2026-10-04",
          source: "manual",
        },
        {
          id: "seed-adam",
          memberId: "adam",
          amount: 10,
          reason: "Friday youth evening",
          date: "2026-10-23",
          source: "attendance",
          activityId: "youth-evening",
        },
      ],
      operations: [],
    },
    {
      id: "olive",
      name: "Olive Community",
      subtitle: "Growing together, one activity at a time.",
      futsal: false,
      members: [
        { id: "sami", name: "Sami N.", initials: "SN", group: "Youth 11–13" },
        { id: "zayd", name: "Zayd T.", initials: "ZT", group: "Youth 14–15" },
      ],
      activities: [
        {
          id: "olive-circle",
          title: "Saturday youth circle",
          description: "A welcoming space to learn, reflect and meet friends.",
          location: "Learning room",
          date: "2026-10-24",
          time: "14:00",
          endTime: "15:00",
          group: "All youth",
          mode: "none",
          points: 0,
          registration: false,
          capacity: 0,
          registered: [],
          attendance: {},
          revision: 0,
        },
      ],
      awards: [],
      operations: [],
    },
  ];
}
export function eligible(activity: Pick<Activity, "group">, member: Member) {
  return activity.group === "All youth" || activity.group === member.group;
}
export function totalPoints(workspace: Workspace, memberId: string) {
  return workspace.awards
    .filter((a) => a.memberId === memberId)
    .reduce((n, a) => n + a.amount, 0);
}
export function validateDraft(draft: ActivityDraft): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("Give your activity a title.");
  if (!draft.location.trim()) errors.push("Add a location.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    Number.isNaN(Date.parse(draft.date)) ||
    new Date(draft.date).toISOString().slice(0, 10) !== draft.date
  )
    errors.push("Choose a valid date.");
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.endTime) ||
    draft.endTime <= draft.time
  )
    errors.push("End time must be later than start time.");
  if (!groups.includes(draft.group)) errors.push("Choose an eligible group.");
  if (!["none", "attendance", "manual", "custom"].includes(draft.mode))
    errors.push("Choose a points rule.");
  if (
    ["attendance", "custom"].includes(draft.mode) &&
    (!Number.isInteger(draft.points) || draft.points < 1 || draft.points > 100)
  )
    errors.push("Choose between 1 and 100 points.");
  if (
    draft.registration &&
    (!Number.isInteger(draft.capacity) ||
      draft.capacity < 1 ||
      draft.capacity > 200)
  )
    errors.push("Capacity must be between 1 and 200.");
  return errors;
}
/** Prototype state transitions. Not an authorization or persistence boundary. */
export function publishActivity(
  workspace: Workspace,
  draft: ActivityDraft,
  id: string,
): Workspace {
  const errors = validateDraft(draft);
  if (errors.length) throw Error(errors.join(" "));
  if (workspace.activities.some((a) => a.id === id)) return workspace;
  return {
    ...workspace,
    activities: [
      ...workspace.activities,
      {
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        location: draft.location.trim(),
        points: ["none", "manual"].includes(draft.mode) ? 0 : draft.points,
        id,
        registered: [],
        attendance: {},
        revision: 0,
      },
    ],
  };
}
export function register(
  workspace: Workspace,
  activityId: string,
  memberId: string,
): Workspace {
  const member = workspace.members.find((m) => m.id === memberId);
  const activity = workspace.activities.find((a) => a.id === activityId);
  if (!member || !activity || !eligible(activity, member))
    throw Error("This activity is not available to this member.");
  if (!activity.registration)
    throw Error("Registration is not needed for this activity.");
  const exists = activity.registered.includes(memberId);
  if (!exists && activity.registered.length >= activity.capacity)
    throw Error("This activity is full.");
  return {
    ...workspace,
    activities: workspace.activities.map((a) =>
      a.id === activityId
        ? {
            ...a,
            registered: exists
              ? a.registered.filter((id) => id !== memberId)
              : [...a.registered, memberId],
            revision: a.revision + 1,
          }
        : a,
    ),
  };
}
export function saveAttendance(
  workspace: Workspace,
  activityId: string,
  changes: Record<string, Attendance>,
  revision: number,
  operation: string,
  reason: string,
): Workspace {
  if (workspace.operations.includes(operation)) return workspace;
  const activity = workspace.activities.find((a) => a.id === activityId);
  if (!activity) throw Error("Activity not found.");
  if (activity.revision !== revision)
    throw Error("This roster changed. Reload it before saving.");
  const awards = [...workspace.awards];
  for (const [memberId, status] of Object.entries(changes)) {
    const member = workspace.members.find((m) => m.id === memberId);
    if (!member || !eligible(activity, member))
      throw Error("A selected member is not eligible for this activity.");
    if (!["unmarked", "present", "absent", "excused"].includes(status))
      throw Error("Invalid attendance status.");
    const old = activity.attendance[memberId] ?? "unmarked";
    if (old === status) continue;
    if (old !== "unmarked" && !reason.trim())
      throw Error("Add a reason for changing saved attendance.");
    if (activity.mode === "attendance") {
      const net = awards
        .filter(
          (a) =>
            a.activityId === activityId &&
            a.memberId === memberId &&
            a.source !== "manual",
        )
        .reduce((n, a) => n + a.amount, 0);
      const target = status === "present" ? activity.points : 0;
      if (target !== net)
        awards.push({
          id: `${operation}:${memberId}`,
          memberId,
          amount: target - net,
          reason: target > net ? activity.title : "Attendance corrected",
          date: activity.date,
          activityId,
          source: target > net ? "attendance" : "correction",
          ...(old !== "unmarked" ? { staffReason: reason.trim() } : {}),
        });
    }
  }
  return {
    ...workspace,
    awards,
    operations: [...workspace.operations, operation],
    activities: workspace.activities.map((a) =>
      a.id === activityId
        ? {
            ...a,
            attendance: { ...a.attendance, ...changes },
            revision: a.revision + 1,
          }
        : a,
    ),
  };
}
export function awardPoints(
  workspace: Workspace,
  memberIds: string[],
  amount: number,
  reason: string,
  operation: string,
): Workspace {
  if (workspace.operations.includes(operation)) return workspace;
  if (
    !memberIds.length ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 100 ||
    !reason.trim()
  )
    throw Error("Select members, enter 1–100 points and add a reason.");
  const unique = [...new Set(memberIds)];
  if (unique.some((id) => !workspace.members.some((m) => m.id === id)))
    throw Error("A recipient does not belong to this workspace.");
  return {
    ...workspace,
    operations: [...workspace.operations, operation],
    awards: [
      ...workspace.awards,
      ...unique.map((memberId) => ({
        id: `${operation}:${memberId}`,
        memberId,
        amount,
        reason: reason.trim(),
        date: "2026-10-18",
        source: "manual" as const,
      })),
    ],
  };
}
