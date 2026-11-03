import { sessionFollowingPlan } from "./session-following-plan.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function contactImportPlan() {
  const baseline = (await sessionFollowingPlan()).digest;
  const files = [
    "db/migrations/generated/0011_contact_import.sql",
    "db/migrations/generated/0012_contact_import_lookup.sql",
    "db/migrations/functions/contact-import.sql",
  ];
  const sources = await Promise.all(files.map((f) => readFile(f, "utf8")));
  const digest = createHash("sha256")
    .update(files.map((f, i) => f + "\n" + sources[i]).join("\n"))
    .digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN PERFORM pg_advisory_xact_lock(hashtext('himmah-contact-import-install')); IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regprocedure('hub_set_follow(text,uuid,uuid,uuid,uuid,jsonb)') IS NULL OR obj_description('hub_set_follow(text,uuid,uuid,uuid,uuid,jsonb)'::regprocedure,'pg_proc') IS DISTINCT FROM 'himmah-session-following-sha256:${baseline}' OR to_regclass('himmah.contact_import_receipts') IS NOT NULL THEN RAISE EXCEPTION 'Contact import target/baseline mismatch';END IF;END $guard$;`,
      `CREATE TEMP TABLE himmah_import_install_snapshot(table_schema text,table_name text,fingerprint text) ON COMMIT DROP;`,
      `DO $snapshot$ DECLARE t record; fingerprint text; BEGIN FOR t IN SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND ((table_schema='public' AND table_name LIKE 'hub_%') OR table_schema='himmah') LOOP EXECUTE format($query$SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) FROM %I.%I r$query$,t.table_schema,t.table_name) INTO fingerprint;INSERT INTO himmah_import_install_snapshot VALUES(t.table_schema,t.table_name,fingerprint);END LOOP;END $snapshot$;`,
      ...sources.map(
        (source) =>
          `DO $install$ BEGIN EXECUTE $source$${source}$source$;END $install$;`,
      ),
      `DO $verify$ DECLARE t record; fingerprint text; BEGIN FOR t IN SELECT * FROM himmah_import_install_snapshot LOOP EXECUTE format($query$SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) FROM %I.%I r$query$,t.table_schema,t.table_name) INTO fingerprint;IF fingerprint IS DISTINCT FROM t.fingerprint THEN RAISE EXCEPTION 'Existing rows changed during import installation';END IF;END LOOP;IF EXISTS(SELECT 1 FROM himmah.contact_import_receipts) THEN RAISE EXCEPTION 'Unexpected import command';END IF;END $verify$;`,
      `COMMENT ON FUNCTION himmah.contact_import(text,uuid,uuid,jsonb,jsonb,text) IS 'himmah-contact-import-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await contactImportPlan()));
