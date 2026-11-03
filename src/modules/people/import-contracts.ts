import {
  contactInput,
  methodInput,
  PeopleError,
  uuid,
  type ContactInput,
  type MethodInput,
} from "./contracts.ts";
export const IMPORT_LIMIT = 500;
export const IMPORT_BYTES = 1024 * 1024;
export const importFields = [
  "displayName",
  "givenName",
  "familyName",
  "email",
  "phone",
] as const;
export type ImportField = (typeof importFields)[number];
export type ImportRow = ContactInput & { row: number; methods: MethodInput[] };
export type ImportMatch = {
  id: string;
  name: string;
  version: number;
  archived: boolean;
};
export type ImportReview = {
  snapshot: string;
  rows: {
    row: number;
    matchCount: number;
    matches: ImportMatch[];
    fileMatches: number[];
    fileMatchCount: number;
  }[];
};
export type ImportResult = {
  created: number;
  skipped: number;
  replayed?: boolean;
};
export function importRow(body: Record<string, unknown>): ImportRow {
  if (
    !Number.isSafeInteger(body.row) ||
    Number(body.row) < 2 ||
    Number(body.row) > 100000
  )
    throw new PeopleError("invalid_input");
  const contact = contactInput({
    ...body,
    displayName:
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName
        : [body.givenName, body.familyName]
            .filter((v) => typeof v === "string")
            .join(" "),
  });
  const methods: MethodInput[] = [];
  for (const kind of ["email", "phone"] as const) {
    const value = body[kind];
    if (value !== undefined && value !== null && value !== "") {
      if (typeof value !== "string") throw new PeopleError("invalid_input");
      if (value.trim())
        methods.push(methodInput({ kind, value, preferred: false }));
    }
  }
  return { ...contact, row: Number(body.row), methods };
}
export function importRows(raw: unknown): ImportRow[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > IMPORT_LIMIT)
    throw new PeopleError("invalid_input");
  const rows = raw.map((r) => {
    if (
      !r ||
      typeof r !== "object" ||
      Array.isArray(r) ||
      Object.keys(r).some(
        (k) =>
          ![
            "row",
            "displayName",
            "givenName",
            "familyName",
            "methods",
          ].includes(k),
      )
    )
      throw new PeopleError("invalid_input");
    if (!Array.isArray(r.methods) || r.methods.length > 2)
      throw new PeopleError("invalid_input");
    const flat: Record<string, unknown> = { ...r };
    const kinds = new Set();
    for (const method of r.methods) {
      if (
        !method ||
        typeof method !== "object" ||
        !["email", "phone"].includes(method.kind) ||
        kinds.has(method.kind)
      )
        throw new PeopleError("invalid_input");
      kinds.add(method.kind);
      const valid = methodInput(method);
      if (
        valid.normalizedValue !== method.normalizedValue ||
        valid.preferred !== false
      )
        throw new PeopleError("invalid_input");
      flat[method.kind] = valid.value;
    }
    return importRow(flat);
  });
  if (new Set(rows.map((r) => r.row)).size !== rows.length)
    throw new PeopleError("invalid_input");
  return rows;
}
export function importCommand(raw: Record<string, unknown>) {
  if (
    Object.keys(raw).some(
      (k) => !["rows", "selected", "snapshot", "key"].includes(k),
    )
  )
    throw new PeopleError("invalid_input");
  const rows = importRows(raw.rows);
  if (
    typeof raw.snapshot !== "string" ||
    !/^[a-f0-9]{32}$/.test(raw.snapshot) ||
    !Array.isArray(raw.selected) ||
    raw.selected.length < 1 ||
    new Set(raw.selected).size !== raw.selected.length ||
    raw.selected.some(
      (n) => !Number.isSafeInteger(n) || !rows.some((r) => r.row === n),
    )
  )
    throw new PeopleError("invalid_input");
  return {
    rows,
    selected: raw.selected as number[],
    snapshot: raw.snapshot,
    key: uuid(raw.key),
  };
}
