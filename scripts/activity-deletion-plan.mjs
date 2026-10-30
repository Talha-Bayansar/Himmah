import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function activityDeletionPlan() {
  const file = "db/migrations/functions/activity-deletion.sql",
    source = await readFile(file, "utf8");
  const digest = createHash("sha256")
    .update(file + "\n" + source)
    .digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regclass('hub_session_operations') IS NULL THEN RAISE EXCEPTION 'Activity deletion target/baseline mismatch'; END IF; PERFORM pg_advisory_xact_lock(hashtext('himmah-activity-deletion-install')); END $guard$;`,
      `DO $install$ BEGIN EXECUTE $source$${source}$source$; END $install$;`,
      `COMMENT ON FUNCTION hub_delete_activity(text,uuid,uuid,uuid,text) IS 'himmah-activity-deletion-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await activityDeletionPlan()));
