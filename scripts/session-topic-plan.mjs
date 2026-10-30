import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function sessionTopicPlan() {
  const file = "db/migrations/generated/0006_session_topic.sql",
    source = await readFile(file, "utf8"),
    digest = createHash("sha256")
      .update(file + "\n" + source)
      .digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regclass('hub_session_operations') IS NULL OR EXISTS(select 1 from information_schema.columns where table_schema='public' and table_name='hub_activity_sessions' and column_name='topic') THEN RAISE EXCEPTION 'Session topic target/baseline mismatch'; END IF; PERFORM pg_advisory_xact_lock(hashtext('himmah-session-topic-install')); END $guard$;`,
      `DO $install$ DECLARE before_rows text; after_rows text; BEGIN
 LOCK TABLE hub_activity_sessions IN ACCESS EXCLUSIVE MODE;
 SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY s.id),'')) INTO before_rows FROM hub_activity_sessions s;
 EXECUTE $source$${source}$source$;
 SELECT md5(coalesce(string_agg((to_jsonb(s)-'topic')::text,'' ORDER BY s.id),'')) INTO after_rows FROM hub_activity_sessions s;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Existing session data changed'; END IF;
 END $install$;`,
      `COMMENT ON COLUMN hub_activity_sessions.topic IS 'himmah-session-topic-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await sessionTopicPlan()));
