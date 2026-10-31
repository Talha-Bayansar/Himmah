import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function sessionCancellationPlan() {
  const file = "db/migrations/functions/session-cancellation.sql",
    source = await readFile(file, "utf8");
  const digest = createHash("sha256")
    .update(file + "\n" + source)
    .digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regclass('hub_session_operations') IS NULL OR NOT EXISTS(select 1 from information_schema.columns where table_schema='public' and table_name='hub_activity_sessions' and column_name='series_id') THEN RAISE EXCEPTION 'Session cancellation target/baseline mismatch'; END IF; PERFORM pg_advisory_xact_lock(hashtext('himmah-session-cancellation-install')); END $guard$;`,
      `DO $install$ DECLARE before_rows text; after_rows text; BEGIN
 LOCK TABLE hub_activity_sessions,hub_session_operations IN SHARE MODE;
 SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY s.id),'')) INTO before_rows FROM hub_activity_sessions s;
 EXECUTE $functions$${source}$functions$;
 SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY s.id),'')) INTO after_rows FROM hub_activity_sessions s;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Existing sessions changed'; END IF;
 END $install$;`,
      `COMMENT ON FUNCTION hub_cancel_sessions(text,uuid,uuid,uuid,jsonb) IS 'himmah-session-cancellation-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await sessionCancellationPlan()));
