import { learningPlan } from "./learning-plan.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function livePlan() {
  const baseline = (await learningPlan()).digest;
  const files = [
    "db/migrations/generated/0009_live_quizzes.sql",
    "db/migrations/functions/live-quizzes.sql",
  ];
  const sources = await Promise.all(files.map((f) => readFile(f, "utf8")));
  const digest = createHash("sha256")
    .update(files.map((f, i) => f + "\n" + sources[i]).join("\n"))
    .digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regprocedure('hub_learning_staff(text,uuid,uuid,uuid,jsonb)') IS NULL OR obj_description('hub_learning_staff(text,uuid,uuid,uuid,jsonb)'::regprocedure,'pg_proc') IS DISTINCT FROM 'himmah-learning-sha256:${baseline}' OR to_regclass('hub_live_rooms') IS NOT NULL OR to_regprocedure('hub_live_host(text,uuid,uuid,uuid,uuid,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Live quiz target/baseline mismatch'; END IF; PERFORM pg_advisory_xact_lock(hashtext('himmah-live-install')); END $guard$;`,
      ...sources.map(
        (source) =>
          `DO $install$ BEGIN EXECUTE $source$${source}$source$; END $install$;`,
      ),
      `COMMENT ON FUNCTION hub_live_host(text,uuid,uuid,uuid,uuid,jsonb) IS 'himmah-live-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await livePlan()));
