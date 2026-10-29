import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function sessionManagementPlan() {
  const files = [
    "db/migrations/generated/0005_unified_session_management.sql",
    "db/migrations/functions/participant-management.sql",
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
      `DO $verify$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regclass('hub_billing_requests') IS NULL OR to_regclass('hub_session_operations') IS NOT NULL THEN RAISE EXCEPTION 'Session management target or baseline mismatch'; END IF; PERFORM pg_advisory_xact_lock(hashtext('himmah-session-management')); END $verify$;`,
      ...sources.map(
        ({ source }) =>
          `DO $install$ BEGIN EXECUTE $source$${source}$source$; END $install$;`,
      ),
      `COMMENT ON TABLE hub_session_operations IS 'himmah-session-management-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await sessionManagementPlan()));
