import { livePlan } from "./live-plan.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function sessionFollowingPlan() {
  const baseline = (await livePlan()).digest;
  const files = [
    "db/migrations/generated/0010_session_following.sql",
    "db/migrations/functions/session-following.sql",
  ];
  const sources = await Promise.all(files.map((f) => readFile(f, "utf8")));
  const digest = createHash("sha256")
    .update(files.map((f, i) => f + "\n" + sources[i]).join("\n"))
    .digest("hex");
  return {
    digest,
    statements: [
      `DO $guard$ BEGIN PERFORM pg_advisory_xact_lock(hashtext('himmah-session-following-install')); IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regprocedure('hub_live_host(text,uuid,uuid,uuid,uuid,jsonb)') IS NULL OR obj_description('hub_live_host(text,uuid,uuid,uuid,uuid,jsonb)'::regprocedure,'pg_proc') IS DISTINCT FROM 'himmah-live-sha256:${baseline}' OR to_regclass('hub_session_follows') IS NOT NULL THEN RAISE EXCEPTION 'Session following target/baseline mismatch'; END IF; END $guard$;`,
      `CREATE TEMP TABLE himmah_follow_install_snapshot(table_schema text, table_name text, fingerprint text) ON COMMIT DROP;`,
      `DO $snapshot$ DECLARE t record; fingerprint text; BEGIN FOR t IN SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND ((table_schema='public' AND table_name LIKE 'hub_%') OR table_schema='himmah') LOOP EXECUTE format($query$SELECT md5(coalesce(string_agg((to_jsonb(r)-$1)::text,'' ORDER BY (to_jsonb(r)-$1)::text),'')) FROM %I.%I r$query$,t.table_schema,t.table_name) INTO fingerprint USING CASE WHEN t.table_name='hub_notifications' THEN ARRAY['activity_id','session_id','follow_id','follow_version','planned_at','session_fingerprint'] ELSE ARRAY[]::text[] END; INSERT INTO himmah_follow_install_snapshot VALUES(t.table_schema,t.table_name,fingerprint); END LOOP; END $snapshot$;`,
      ...sources.map(
        (source) =>
          `DO $install$ BEGIN EXECUTE $source$${source}$source$; END $install$;`,
      ),
      `DO $verify$ DECLARE t record; fingerprint text; BEGIN FOR t IN SELECT * FROM himmah_follow_install_snapshot LOOP EXECUTE format($query$SELECT md5(coalesce(string_agg((to_jsonb(r)-$1)::text,'' ORDER BY (to_jsonb(r)-$1)::text),'')) FROM %I.%I r$query$,t.table_schema,t.table_name) INTO fingerprint USING CASE WHEN t.table_name='hub_notifications' THEN ARRAY['activity_id','session_id','follow_id','follow_version','planned_at','session_fingerprint'] ELSE ARRAY[]::text[] END; IF fingerprint IS DISTINCT FROM t.fingerprint THEN RAISE EXCEPTION 'Existing rows changed during follow installation'; END IF; END LOOP; IF EXISTS(SELECT 1 FROM hub_session_follows) OR EXISTS(SELECT 1 FROM hub_follow_requests) THEN RAISE EXCEPTION 'Unexpected personal enrolment'; END IF; END $verify$;`,
      `COMMENT ON FUNCTION hub_set_follow(text,uuid,uuid,uuid,uuid,jsonb) IS 'himmah-session-following-sha256:${digest}';`,
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await sessionFollowingPlan()));
