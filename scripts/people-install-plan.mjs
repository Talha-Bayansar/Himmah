import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
/** Generates SQL only. The caller must independently verify the Himmah project, branch and endpoint. */
export async function peopleInstallPlan() {
  const files = [
    ...(await readdir("db/rebuild/generated"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => "db/rebuild/generated/" + f),
    ...["contacts", "directory", "communication", "hosting"].map(
      (f) => "db/rebuild/" + f + ".sql",
    ),
  ];
  const sources = await Promise.all(
    files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );
  const digest = createHash("sha256")
    .update(sources.map((s) => s.file + "\n" + s.source).join("\n"))
    .digest("hex");
  const guard = `DO $guard$ BEGIN
 PERFORM pg_advisory_xact_lock(716442031);
 IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regnamespace('himmah') IS NOT NULL OR to_regclass('public.hub_organizations') IS NULL OR to_regclass('public.hub_memberships') IS NULL THEN RAISE EXCEPTION 'Unexpected target or People already installed'; END IF;
 END $guard$;`;
  const statements = [
    guard,
    ...sources.map(({ source }) => {
      if (source.includes("$himmah_install_source$"))
        throw Error("SQL delimiter collision");
      return `DO $himmah_install$ BEGIN EXECUTE $himmah_install_source$${source}$himmah_install_source$; END $himmah_install$;`;
    }),
    `CREATE TABLE himmah.installation_receipts(digest text PRIMARY KEY, installed_at timestamptz NOT NULL DEFAULT now());`,
    `INSERT INTO himmah.installation_receipts(digest) VALUES('${digest}');`,
  ];
  return { digest, files, statements };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await peopleInstallPlan()));
