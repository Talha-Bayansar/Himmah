import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function recurrencePlan({ functionsOnly = false } = {}) {
  const files = [
    "db/migrations/generated/0007_session_series.sql",
    "db/migrations/functions/recurrence.sql",
  ];
  const sources = await Promise.all(files.map((f) => readFile(f, "utf8")));
  const digest = createHash("sha256")
    .update(files.map((f, i) => f + "\n" + sources[i]).join("\n"))
    .digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regclass('hub_session_operations') IS NULL OR NOT EXISTS(select 1 from information_schema.columns where table_schema='public' and table_name='hub_activity_sessions' and column_name='topic') OR ${functionsOnly ? "NOT " : ""}EXISTS(select 1 from information_schema.columns where table_schema='public' and table_name='hub_activity_sessions' and column_name='series_id') THEN RAISE EXCEPTION 'Recurrence target/baseline mismatch'; END IF; PERFORM pg_advisory_xact_lock(hashtext('himmah-recurrence-install')); END $guard$;`,
      `DO $install$ DECLARE before_rows text; after_rows text; BEGIN
 LOCK TABLE hub_activity_sessions IN ACCESS EXCLUSIVE MODE;
 SELECT md5(coalesce(string_agg((to_jsonb(s)-'series_id'-'series_position')::text,'' ORDER BY s.id),'')) INTO before_rows FROM hub_activity_sessions s;
 ${functionsOnly ? "" : `EXECUTE $schema$${sources[0]}$schema$;`}
 EXECUTE $functions$${sources[1]}$functions$;
 SELECT md5(coalesce(string_agg((to_jsonb(s)-'series_id'-'series_position')::text,'' ORDER BY s.id),'')) INTO after_rows FROM hub_activity_sessions s;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Existing sessions changed'; END IF;
 END $install$;`,
      `COMMENT ON FUNCTION hub_plan_sessions(text,uuid,uuid,uuid,jsonb) IS 'himmah-recurrence-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(
    JSON.stringify(
      await recurrencePlan({
        functionsOnly: process.argv.includes("--functions-only"),
      }),
    ),
  );
