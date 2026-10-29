import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function registrationPlan() {
  const files = [
    "db/migrations/generated/0001_session_registration.sql",
    "db/migrations/generated/0002_session_pricing.sql",
    "db/migrations/functions/registration.sql",
    "db/migrations/functions/pricing.sql",
  ];
  const sources = await Promise.all(
    files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );
  const digest = createHash("sha256")
    .update(sources.map((s) => s.file + "\n" + s.source).join("\n"))
    .digest("hex");
  const statements = [
    `DO $verify$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regclass('public.hub_activity_sessions') IS NULL OR to_regclass('himmah.contacts') IS NULL OR to_regclass('public.hub_session_registrations') IS NOT NULL THEN RAISE EXCEPTION 'Registration target or baseline mismatch'; END IF; END $verify$;`,
    ...sources.map(
      ({ source }) =>
        `DO $install$ BEGIN EXECUTE $source$${source}$source$; END $install$;`,
    ),
    `COMMENT ON TABLE public.hub_session_registration_settings IS 'himmah-registration-sha256:${digest}';`,
  ];
  return { files, digest, statements };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await registrationPlan()));
