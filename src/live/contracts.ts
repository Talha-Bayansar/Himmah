import { CommunityError, uuid, versionInput } from "../community/contracts.ts";
export type LivePhase =
  "lobby" | "question" | "locked" | "revealed" | "finished";
export type LiveState = {
  id: string;
  code: string;
  title: string;
  state: LivePhase;
  questionIndex: number;
  questionCount: number;
  version: number;
  expiresAt: string;
  expired: boolean;
  joined: boolean;
  participants: number;
  answered?: number;
  question?: {
    text: string;
    choices: string[];
    correct?: number;
    explanation?: string;
  };
  player?: {
    number: number;
    nickname: string | null;
    revision: number;
    choice: number | null;
    score: number | null;
  };
  summary?: {
    index: number;
    text: string;
    answered: number;
    correct: number;
  }[];
  distribution?: { choice: number; count: number }[];
  played?: number;
};
export type LiveRoom = {
  id: string;
  code: string;
  title: string;
  state: LivePhase;
  expiresAt: string;
  createdAt: string;
};
export type LivePlayer = {
  id: string;
  nickname: string | null;
  number: number;
  revoked: boolean;
  createdAt: string;
};
export function codeInput(value: unknown) {
  if (typeof value !== "string" || !/^[A-F0-9]{10}$/.test(value))
    throw new CommunityError("invalid_input");
  return value;
}
export function hostInput(b: Record<string, unknown>, room: string | null) {
  const key = uuid(b.key),
    id = room ?? uuid(b.id),
    action = String(b.action);
  if (
    (!room && action !== "create") ||
    (room &&
      !["start", "lock", "reveal", "next", "finish", "remove"].includes(action))
  )
    throw new CommunityError("invalid_input");
  const payload: Record<string, unknown> = { action };
  if (action === "create") payload.publication = uuid(b.publication);
  else payload.version = versionInput(b);
  if (action === "remove") payload.player = uuid(b.player);
  return { key, id, payload };
}
export function answerInput(b: Record<string, unknown>) {
  if (
    b.action !== "answer" ||
    !Number.isInteger(b.question) ||
    Number(b.question) < 0 ||
    Number(b.question) > 49 ||
    !Number.isInteger(b.choice) ||
    Number(b.choice) < 0 ||
    Number(b.choice) > 5
  )
    throw new CommunityError("invalid_input");
  return {
    action: "answer",
    version: versionInput(b),
    revision: versionInput({ version: b.revision }),
    question: b.question,
    choice: b.choice,
  };
}
