import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function learningPlan({ functionsOnly = false } = {}) {
  const files = [
    "db/migrations/generated/0008_learning.sql",
    "db/migrations/functions/learning.sql",
  ];
  const sources = await Promise.all(files.map((f) => readFile(f, "utf8")));
  const digest = createHash("sha256")
    .update(files.map((f, i) => f + "\n" + sources[i]).join("\n"))
    .digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regclass('himmah.contacts') IS NULL OR to_regprocedure('hub_cancel_sessions(text,uuid,uuid,uuid,jsonb)') IS NULL OR ${functionsOnly ? "NOT " : ""}to_regclass('hub_learning_items') IS NOT NULL THEN RAISE EXCEPTION 'Learning target/baseline mismatch'; END IF; PERFORM pg_advisory_xact_lock(hashtext('himmah-learning-install')); END $guard$;`,
      `DO $install$ DECLARE before_rows text; after_rows text; BEGIN
 LOCK TABLE hub_activity_sessions,hub_activities IN SHARE MODE;
 SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY s.id),'')) INTO before_rows FROM hub_activity_sessions s;
 ${functionsOnly ? "" : `EXECUTE $schema$${sources[0]}$schema$;`}
 EXECUTE $functions$${sources[1]}$functions$;
 SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'' ORDER BY s.id),'')) INTO after_rows FROM hub_activity_sessions s;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Existing sessions changed'; END IF;
 END $install$;`,
      `COMMENT ON FUNCTION hub_learning_staff(text,uuid,uuid,uuid,jsonb) IS 'himmah-learning-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(
    JSON.stringify(
      await learningPlan({
        functionsOnly: process.argv.includes("--functions-only"),
      }),
    ),
  );
