import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function billingPlan() {
  const files = [
    "db/migrations/generated/0004_participant_billing.sql",
    "db/migrations/functions/pricing.sql",
    "db/migrations/functions/registration.sql",
    "db/migrations/functions/cash.sql",
    "db/migrations/functions/billing.sql",
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
      `DO $verify$ BEGIN IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regclass('hub_cash_receipts') IS NULL OR to_regclass('hub_billing_requests') IS NOT NULL THEN RAISE EXCEPTION 'Participant billing target or baseline mismatch'; END IF; PERFORM pg_advisory_xact_lock(hashtext('himmah-participant-billing')); END $verify$;`,
      ...sources.map(
        ({ source }, i) =>
          `DO $install$ BEGIN EXECUTE $source$${i > 0 && i < 4 ? source.replace(/^CREATE TRIGGER[^\n]*;\s*$/gm, "") : source}$source$; END $install$;`,
      ),
      `COMMENT ON TABLE hub_billing_requests IS 'himmah-billing-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await billingPlan()));
