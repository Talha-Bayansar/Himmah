import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function pricingPlan() {
  const files = [
    "db/migrations/generated/0002_session_pricing.sql",
    "db/migrations/functions/registration.sql",
    "db/migrations/functions/pricing.sql",
  ];
  const sources = await Promise.all(
    files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );
  // Existing registration triggers are retained; only their function definitions change.
  const registration = sources[1].source.split(
    "CREATE TRIGGER hub_registration_schedule_guard",
  )[0];
  const digest = createHash("sha256")
    .update(sources.map((s) => s.file + "\n" + s.source).join("\n"))
    .digest("hex");
  const statements = [
    `DO $verify$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regclass('public.hub_session_registrations') IS NULL OR to_regclass('public.hub_registration_charges') IS NOT NULL THEN RAISE EXCEPTION 'Pricing target or baseline mismatch'; END IF; PERFORM pg_advisory_xact_lock(hashtext('himmah-session-pricing')); END $verify$;`,
    ...[sources[0].source, registration, sources[2].source].map(
      (source) =>
        `DO $install$ BEGIN EXECUTE $source$${source}$source$; END $install$;`,
    ),
    `COMMENT ON TABLE public.hub_registration_charges IS 'himmah-pricing-sha256:${digest}';`,
  ];
  return { files, digest, statements };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await pricingPlan()));
