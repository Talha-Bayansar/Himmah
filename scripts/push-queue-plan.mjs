import { customFieldsPlan } from "./custom-fields-plan.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function pushQueuePlan() {
  const baseline = (await customFieldsPlan()).digest;
  const source = await readFile(
    "db/migrations/generated/0014_push_device_queue.sql",
    "utf8",
  );
  const digest = createHash("sha256").update(source).digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR obj_description('himmah.custom_field_config(uuid)'::regprocedure,'pg_proc') IS DISTINCT FROM 'himmah-custom-fields-sha256:${baseline}' OR to_regclass('public.hub_push_device_queue') IS NOT NULL THEN RAISE EXCEPTION 'Push queue index target/baseline mismatch';END IF;END $guard$;`,
      source,
      `COMMENT ON INDEX hub_push_device_queue IS 'himmah-push-queue-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await pushQueuePlan()));
