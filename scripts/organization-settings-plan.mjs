import { pushQueuePlan } from "./push-queue-plan.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function organizationSettingsPlan() {
  const baseline = (await pushQueuePlan()).digest;
  const files = [
    "db/migrations/generated/0015_organization_settings.sql",
    "db/migrations/functions/organization-settings.sql",
  ];
  const sources = await Promise.all(files.map((f) => readFile(f, "utf8")));
  const digest = createHash("sha256")
    .update(files.map((f, i) => f + "\n" + sources[i]).join("\n"))
    .digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN PERFORM pg_advisory_xact_lock(hashtext('himmah-organization-settings-install'));IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR obj_description('public.hub_push_device_queue'::regclass,'pg_class') IS DISTINCT FROM 'himmah-push-queue-sha256:${baseline}' OR to_regclass('hub_organization_settings') IS NOT NULL THEN RAISE EXCEPTION 'Organization settings target/baseline mismatch';END IF;END $guard$;`,
      `CREATE TEMP TABLE himmah_settings_install_snapshot(table_schema text,table_name text,fingerprint text) ON COMMIT DROP;`,
      `DO $snapshot$ DECLARE t record; fingerprint text;BEGIN FOR t IN SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND ((table_schema='public' AND table_name LIKE 'hub_%') OR table_schema='himmah') LOOP EXECUTE format($query$SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) FROM %I.%I r$query$,t.table_schema,t.table_name) INTO fingerprint;INSERT INTO himmah_settings_install_snapshot VALUES(t.table_schema,t.table_name,fingerprint);END LOOP;END $snapshot$;`,
      ...sources.map(
        (source) =>
          `DO $install$ BEGIN EXECUTE $source$${source}$source$;END $install$;`,
      ),
      `DO $verify$ DECLARE t record; fingerprint text;BEGIN FOR t IN SELECT * FROM himmah_settings_install_snapshot LOOP EXECUTE format($query$SELECT md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) FROM %I.%I r$query$,t.table_schema,t.table_name) INTO fingerprint;IF fingerprint IS DISTINCT FROM t.fingerprint THEN RAISE EXCEPTION 'Existing rows changed during settings installation';END IF;END LOOP;IF EXISTS(SELECT 1 FROM hub_organization_settings) OR EXISTS(SELECT 1 FROM hub_organization_settings_requests) THEN RAISE EXCEPTION 'Unexpected settings command';END IF;END $verify$;`,
      `COMMENT ON FUNCTION hub_save_organization_settings(text,uuid,uuid,jsonb) IS 'himmah-organization-settings-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await organizationSettingsPlan()));
