import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function cashPlan() {
  const files = [
    "db/migrations/generated/0003_session_cash.sql",
    "db/migrations/functions/cash.sql",
  ];
  const sources = await Promise.all(
    files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );
  const digest = createHash("sha256")
    .update(sources.map((s) => s.file + "\n" + s.source).join("\n"))
    .digest("hex");
  return {
    files,
    digest,
    statements: [
      `DO $verify$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regclass('public.hub_registration_charges') IS NULL OR to_regclass('public.hub_cash_receipts') IS NOT NULL THEN RAISE EXCEPTION 'Cash target or baseline mismatch'; END IF;PERFORM pg_advisory_xact_lock(hashtext('himmah-session-cash')); END $verify$;`,
      ...sources.map(
        ({ source }) =>
          `DO $install$ BEGIN EXECUTE $source$${source}$source$; END $install$;`,
      ),
      `COMMENT ON TABLE public.hub_cash_receipts IS 'himmah-cash-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await cashPlan()));
