import { sql } from "drizzle-orm";
import type { Execute } from "./store.ts";
import type { ImportRow } from "./import-contracts.ts";
export function createContactImportStore(run: Execute) {
  return {
    async reviewImport(actor: string, org: string, rows: ImportRow[]) {
      return (
        await run(
          sql`select himmah.contact_import_review(${actor},${org}::uuid,${JSON.stringify(rows)}::jsonb) result`,
        )
      )[0]?.result as Record<string, unknown> | null;
    },
    async importContacts(
      actor: string,
      org: string,
      body: {
        key: string;
        rows: ImportRow[];
        selected: number[];
        snapshot: string;
      },
    ) {
      return (
        await run(
          sql`select himmah.contact_import(${actor},${org}::uuid,${body.key}::uuid,${JSON.stringify(body.rows)}::jsonb,${JSON.stringify(body.selected)}::jsonb,${body.snapshot}) result`,
        )
      )[0]?.result as Record<string, unknown> | null;
    },
  };
}
