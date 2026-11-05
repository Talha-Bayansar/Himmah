import { PeopleError, uuid } from "./contracts.ts";
export const fieldKinds = [
  "text",
  "number",
  "date",
  "boolean",
  "choice",
] as const;
export type FieldKind = (typeof fieldKinds)[number];
export type CustomField = {
  id: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  options: string[];
  archivedAt: string | null;
  version: number;
};
export type CustomValues = Record<string, string | number | boolean>;
export type FieldConfig = { fields: CustomField[]; snapshot: string };
export function fieldInput(raw: Record<string, unknown>) {
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (
    !label ||
    label.length > 100 ||
    /[\u0000-\u001f\u007f]/u.test(label) ||
    !fieldKinds.includes(raw.kind as FieldKind) ||
    typeof raw.required !== "boolean"
  )
    throw new PeopleError("invalid_input");
  const options = raw.options;
  if (
    !Array.isArray(options) ||
    options.length > 30 ||
    options.some(
      (v) =>
        typeof v !== "string" ||
        !v.trim() ||
        v.trim().length > 100 ||
        /[\u0000-\u001f\u007f]/u.test(v),
    ) ||
    new Set(options.map((v) => v.trim())).size !== options.length ||
    (raw.kind === "choice" ? options.length < 2 : options.length !== 0)
  )
    throw new PeopleError("invalid_input");
  return {
    label,
    kind: raw.kind as FieldKind,
    required: raw.required,
    options: options.map((v) => v.trim()) as string[],
  };
}
export function checkedCustomValues(v: unknown): CustomValues {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).length > 50
  )
    throw new PeopleError("invalid_input");
  for (const [id, value] of Object.entries(v)) {
    uuid(id);
    if (
      !(
        typeof value === "string" &&
        value.length <= 1000 &&
        !/[\u0000-\u001f\u007f]/u.test(value)
      ) &&
      !(
        typeof value === "number" &&
        Number.isFinite(value) &&
        Math.abs(value) <= 1e12
      ) &&
      typeof value !== "boolean"
    )
      throw new PeopleError("invalid_input");
  }
  return v as CustomValues;
}
export function customPayload(raw: Record<string, unknown>) {
  if (raw.customValues === undefined && raw.customFieldsSnapshot === undefined)
    return {};
  if (
    typeof raw.customFieldsSnapshot !== "string" ||
    !/^[a-f0-9]{32}$/.test(raw.customFieldsSnapshot)
  )
    throw new PeopleError("invalid_input");
  return {
    customValues: checkedCustomValues(raw.customValues),
    customFieldsSnapshot: raw.customFieldsSnapshot,
  };
}
export function valuesValid(fields: CustomField[], values: CustomValues) {
  return fields
    .filter((f) => !f.archivedAt)
    .every((f) => {
      const v = values[f.id];
      if (v === undefined || v === "") return !f.required;
      return f.kind === "text"
        ? typeof v === "string" &&
            v.length <= 1000 &&
            (!f.required || !!v.trim())
        : f.kind === "number"
          ? typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e12
          : f.kind === "boolean"
            ? typeof v === "boolean"
            : f.kind === "choice"
              ? typeof v === "string" && f.options.includes(v)
              : typeof v === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(v) &&
                v.slice(0, 4) !== "0000" &&
                !Number.isNaN(Date.parse(v)) &&
                new Date(v).toISOString().slice(0, 10) === v;
    });
}
