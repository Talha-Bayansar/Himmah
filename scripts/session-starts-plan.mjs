import { organizationSettingsPlan } from "./organization-settings-plan.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function sessionStartsPlan() {
  const baseline = (await organizationSettingsPlan()).digest;
  const files = [
    "db/migrations/generated/0016_session_started.sql",
    "db/migrations/generated/0017_directory_order.sql",
    "db/migrations/functions/session-starts.sql",
  ];
  const sources = await Promise.all(files.map((f) => readFile(f, "utf8")));
  const digest = createHash("sha256")
    .update(files.map((f, i) => f + "\n" + sources[i]).join("\n"))
    .digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN PERFORM pg_advisory_xact_lock(hashtext('himmah-session-starts-install'));IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR obj_description('public.hub_save_organization_settings(text,uuid,uuid,jsonb)'::regprocedure,'pg_proc') IS DISTINCT FROM 'himmah-organization-settings-sha256:${baseline}' OR to_regprocedure('public.hub_generate_session_starts()') IS NOT NULL THEN RAISE EXCEPTION 'Session starts target/baseline mismatch';END IF;END $guard$;`,
      `CREATE TEMP TABLE himmah_starts_snapshot(table_schema text,table_name text,fingerprint text) ON COMMIT DROP;`,
      `DO $snapshot$ DECLARE t record; fingerprint text;BEGIN FOR t IN SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND ((table_schema='public' AND table_name LIKE 'hub_%') OR table_schema='himmah') LOOP EXECUTE format($query$SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) FROM %I.%I r$query$,t.table_schema,t.table_name) INTO fingerprint;INSERT INTO himmah_starts_snapshot VALUES(t.table_schema,t.table_name,fingerprint);END LOOP;END $snapshot$;`,
      ...sources.map(
        (source) =>
          `DO $install$ BEGIN EXECUTE $source$${source}$source$;END $install$;`,
      ),
      `DO $verify$ DECLARE t record; fingerprint text;BEGIN FOR t IN SELECT * FROM himmah_starts_snapshot LOOP EXECUTE format($query$SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) FROM %I.%I r$query$,t.table_schema,t.table_name) INTO fingerprint;IF fingerprint IS DISTINCT FROM t.fingerprint THEN RAISE EXCEPTION 'Existing rows changed during session-start installation';END IF;END LOOP;END $verify$;`,
      `COMMENT ON FUNCTION hub_generate_session_starts() IS 'himmah-session-starts-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await sessionStartsPlan()));
