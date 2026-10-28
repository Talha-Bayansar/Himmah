import { CommunityError, uuid } from "../../community/contracts.ts";
export { uuid };
export class PeopleError extends CommunityError {}
export type Contact = {
  id: string;
  displayName: string;
  activeGroupCount?: number;
  communicationDependentCount?: number;
  givenName: string | null;
  familyName: string | null;
  version: number;
  createdAt: string;
  archivedAt: string | null;
};
export type ContactMethod = {
  id: string;
  kind: "phone" | "email";
  value: string;
  preferred: boolean;
  createdAt: string;
};
export type ContactInput = {
  displayName: string;
  givenName: string | null;
  familyName: string | null;
};
export type MethodInput = {
  kind: "phone" | "email";
  value: string;
  normalizedValue: string;
  preferred: boolean;
};
const name = (value: unknown, optional = false): string | null => {
  if (
    optional &&
    (value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim()))
  )
    return null;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 120 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new PeopleError("invalid_input");
  return value.trim();
};
export function contactInput(body: Record<string, unknown>): ContactInput {
  return {
    displayName: name(body.displayName)!,
    givenName: name(body.givenName, true),
    familyName: name(body.familyName, true),
  };
}
export function methodInput(body: Record<string, unknown>): MethodInput {
  if (
    typeof body.value !== "string" ||
    typeof body.preferred !== "boolean" ||
    /[\u0000-\u001f\u007f]/u.test(body.value)
  )
    throw new PeopleError("invalid_input");
  const value = body.value.trim();
  if (
    body.kind === "email" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  )
    return {
      kind: "email",
      value,
      normalizedValue: value.toLowerCase(),
      preferred: body.preferred,
    };
  if (
    body.kind === "phone" &&
    value.length <= 64 &&
    /^\+[\d ()-]+$/.test(value)
  ) {
    const normalizedValue = value.replace(/[ ()-]/g, "");
    if (/^\+[1-9]\d{6,14}$/.test(normalizedValue))
      return {
        kind: "phone",
        value,
        normalizedValue,
        preferred: body.preferred,
      };
  }
  throw new PeopleError("invalid_input");
}
export function expectedVersion(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > 2147483646
  )
    throw new PeopleError("invalid_input");
  return Number(value);
}

export type PeopleGroup = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  memberCount: number;
};
export type GroupMember = {
  id: string;
  contactId: string;
  displayName: string;
  contactVersion: number;
  contactArchived: boolean;
  version: number;
  validFrom: string;
  validTo: string | null;
  endReason: string | null;
  createdAt: string;
};
export type ContactGroup = {
  id: string;
  groupId: string;
  name: string;
  groupVersion: number;
  groupArchived: boolean;
  version: number;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
};
export type LocalizedLabels = { en: string; nl: string; tr: string };
export type RelationshipType = {
  id: string;
  code: string;
  symmetric: boolean;
  category: "family" | "other";
  version: number;
  typeVersionId: string;
  forwardLabels: LocalizedLabels;
  inverseLabels: LocalizedLabels;
  archivedAt: string | null;
  createdAt: string;
};
export type ContactRelationship = {
  id: string;
  contactId: string;
  displayName: string;
  contactArchived: boolean;
  subjectIsSource: boolean;
  typeId: string;
  typeVersionId: string;
  forwardLabels: LocalizedLabels;
  inverseLabels: LocalizedLabels;
  symmetric: boolean;
  version: number;
  validFrom: string;
  validTo: string | null;
  endReason: string | null;
  createdAt: string;
};
export function groupInput(body: Record<string, unknown>) {
  const value = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    body.description === undefined ||
    body.description === null ||
    body.description === ""
      ? null
      : typeof body.description === "string"
        ? body.description.trim()
        : undefined;
  if (
    !value ||
    value.length > 100 ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    description === undefined ||
    (description !== null &&
      (description.length > 500 || /[\u0000\u007f]/u.test(description)))
  )
    throw new PeopleError("invalid_input");
  return { name: value, description: description || null };
}
export function reasonInput(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 300 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new PeopleError("invalid_input");
  return value.trim();
}
export function labelsInput(value: unknown): LocalizedLabels {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PeopleError("invalid_input");
  const input = value as Record<string, unknown>;
  const out = {} as LocalizedLabels;
  for (const locale of ["en", "nl", "tr"] as const) {
    const label = input[locale];
    if (
      typeof label !== "string" ||
      !label.trim() ||
      label.trim().length > 80 ||
      /[\u0000-\u001f\u007f]/u.test(label)
    )
      throw new PeopleError("invalid_input");
    out[locale] = label.trim();
  }
  return out;
}
export function relationshipTypeInput(
  body: Record<string, unknown>,
  creating: boolean,
) {
  const forwardLabels = labelsInput(body.forwardLabels),
    inverseLabels = labelsInput(body.inverseLabels);
  if (
    creating &&
    (typeof body.symmetric !== "boolean" ||
      !["family", "other"].includes(String(body.category)))
  )
    throw new PeopleError("invalid_input");
  if (
    body.symmetric === true &&
    JSON.stringify(forwardLabels) !== JSON.stringify(inverseLabels)
  )
    throw new PeopleError("invalid_input");
  return {
    forwardLabels,
    inverseLabels,
    ...(creating ? { symmetric: body.symmetric, category: body.category } : {}),
  };
}

export type CommunicationAssignment = {
  id: string;
  responsibleContactId: string;
  displayName: string;
  contactArchived: boolean;
  purpose: "routine" | "emergency";
  priority: number;
  channel: "phone" | "email" | "any";
  version: number;
  validTo: string | null;
  endReason: string | null;
  createdAt: string;
  phone: string | null;
  email: string | null;
};
export type CommunicationPreferences = {
  routineDirectAllowed: boolean;
  emergencyDirectAllowed: boolean;
};
export type RoutingCandidate = {
  contactId: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  priority: number;
  direct: boolean;
};
export type ContactRouting = {
  preferences: CommunicationPreferences;
  routine: {
    candidates: RoutingCandidate[];
    total: number;
    missing: number;
    alternatives: number;
  };
  emergency: {
    candidates: RoutingCandidate[];
    total: number;
    missing: number;
    alternatives: number;
  };
};
export function communicationInput(body: Record<string, unknown>) {
  if (
    !["routine", "emergency"].includes(String(body.purpose)) ||
    !["phone", "email", "any"].includes(String(body.channel)) ||
    !Number.isInteger(body.priority) ||
    Number(body.priority) < 1 ||
    Number(body.priority) > 99
  )
    throw new PeopleError("invalid_input");
  return {
    purpose: body.purpose,
    channel: body.channel,
    priority: body.priority,
    responsibleContactId: uuid(body.responsibleContactId),
    responsibleVersion: expectedVersion(body.responsibleVersion),
  };
}
