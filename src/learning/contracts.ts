import { CommunityError, uuid, versionInput } from "../community/contracts.ts";
export type Question = {
  text: string;
  choices: string[];
  correct: number;
  explanation: string;
};
export type Content = {
  title: string;
  description: string;
  mode: "assigned" | "open";
  release: "immediate" | "manual";
  opensAt: string;
  closesAt: string;
  questions: Question[];
};
export type LearningItem = {
  hasDraftChanges?: boolean;
  id: string;
  title: string;
  description: string;
  activityId: string | null;
  sessionId: string | null;
  activityName: string | null;
  sessionTopic: string | null;
  draft: Content;
  state: "draft" | "published" | "closed";
  version: number;
  currentPublication: string | null;
  createdAt: string;
};
export type Publication = {
  id: string;
  number: number;
  released: boolean;
  hasLink: boolean;
  content: Content;
};
export type LearningDetail = {
  item: LearningItem;
  publication: Publication | null;
  versions: { id: string; number: number }[];
  counts: { assigned: number; started: number; submitted: number };
};
export type Recipient = {
  id: string;
  name: string;
  contactId: string | null;
  revoked: boolean;
  allowance: number;
  revision: number;
  createdAt: string;
  attempts: number;
  score: number | null;
  submittedAt: string | null;
  status: "invited" | "started" | "submitted";
};
export type PublicLearning = {
  questionCount: number;
  title: string;
  description: string;
  mode: "assigned" | "open";
  opensAt: string;
  closesAt: string;
  release: "immediate" | "manual";
  number: number;
  available: boolean;
  name: string | null;
  allowance: number;
  questions: (Omit<Question, "correct" | "explanation"> & Partial<Question>)[];
  attempt: null | {
    id: string;
    sequence: number;
    answers: Record<string, number>;
    revision: number;
    submittedAt: string | null;
    score: number | null;
    total: number;
    released: boolean;
  };
};
export const freshContent = (): Content => ({
  title: "",
  description: "",
  mode: "assigned",
  release: "immediate",
  opensAt: "",
  closesAt: "",
  questions: [{ text: "", choices: ["", ""], correct: 0, explanation: "" }],
});
const fail = () => {
  throw new CommunityError("invalid_input");
};
const plain = (x: unknown, max: number, min = 0) =>
  typeof x === "string" &&
  x.trim().length >= min &&
  x.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)
    ? x.trim()
    : fail();
export function contentInput(x: unknown): Content {
  if (!x || typeof x !== "object") return fail();
  const v = x as Content;
  const title = plain(v.title, 160, 2),
    description = plain(v.description, 1000);
  if (
    !["assigned", "open"].includes(v.mode) ||
    !["immediate", "manual"].includes(v.release) ||
    !Array.isArray(v.questions) ||
    v.questions.length < 1 ||
    v.questions.length > 50
  )
    return fail();
  const instant = (s: unknown) =>
    s === ""
      ? ""
      : typeof s === "string" &&
          /^\d{4}-\d{2}-\d{2}T/.test(s) &&
          Number.isFinite(Date.parse(s))
        ? new Date(s).toISOString()
        : fail();
  const opensAt = instant(v.opensAt),
    closesAt = instant(v.closesAt);
  if (opensAt && closesAt && opensAt >= closesAt) return fail();
  return {
    title,
    description,
    mode: v.mode,
    release: v.release,
    opensAt,
    closesAt,
    questions: v.questions.map((q) => {
      if (
        !q ||
        !Array.isArray(q.choices) ||
        q.choices.length < 2 ||
        q.choices.length > 6 ||
        !Number.isInteger(q.correct) ||
        q.correct < 0 ||
        q.correct >= q.choices.length
      )
        return fail();
      return {
        text: plain(q.text, 500, 1),
        choices: q.choices.map((c) => plain(c, 300, 1)),
        correct: q.correct,
        explanation: plain(q.explanation, 1000),
      };
    }),
  };
}
export function staffInput(b: Record<string, unknown>) {
  const key = uuid(b.key),
    action = b.action;
  let p: Record<string, unknown> = { action };
  if (
    ![
      "create",
      "save",
      "publish",
      "close",
      "reopen",
      "release",
      "open-link",
      "assign",
      "revoke",
      "allow",
    ].includes(String(action))
  )
    return fail();
  if (action !== "create") p.version = versionInput(b);
  if (action === "create" || action === "save")
    p = {
      ...p,
      content: contentInput(b.content),
      activity: b.activity ? uuid(b.activity) : null,
      session: b.session ? uuid(b.session) : null,
    };
  if (
    ["release", "open-link", "assign", "revoke", "allow"].includes(
      String(action),
    )
  )
    p.publication = uuid(b.publication);
  if (action === "open-link") p.token = tokenInput(b.token);
  if (action === "assign") {
    if (
      !Array.isArray(b.recipients) ||
      b.recipients.length < 1 ||
      b.recipients.length > 50
    )
      return fail();
    p.recipients = b.recipients.map((v) => ({
      contact: uuid(v.contact),
      token: tokenInput(v.token),
    }));
    if (
      new Set((p.recipients as { contact: string }[]).map((v) => v.contact))
        .size !== b.recipients.length
    )
      return fail();
  }
  if (action === "allow" || action === "revoke") {
    p.recipient = uuid(b.recipient);
    p.recipientRevision = versionInput({ version: b.recipientRevision });
  }
  return { key, payload: p };
}
export function tokenInput(v: unknown) {
  return typeof v === "string" && /^[a-f0-9]{64}$/.test(v) ? v : fail();
}
export function secretToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hashToken(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
