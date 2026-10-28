import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
/** SQL plan only; independent control-plane target verification is mandatory. */
export async function removalPlan() {
  const files = [
    "db/removals/20261028_remove_dropped_features.sql",
    ...["people-adapter", "access", "attendance", "notifications"].map(
      (f) => "db/migrations/functions/" + f + ".sql",
    ),
  ];
  const sources = await Promise.all(
    files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );
  const digest = createHash("sha256")
    .update(sources.map((s) => s.file + "\n" + s.source).join("\n"))
    .digest("hex");
  const statements = sources.map(({ source }) => {
    if (source.includes("$removal_source$"))
      throw Error("SQL delimiter collision");
    return `DO $removal_install$ BEGIN EXECUTE $removal_source$${source}$removal_source$; END $removal_install$;`;
  });
  statements.push(
    "CREATE TABLE himmah.feature_removal_receipts(digest text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());",
    `INSERT INTO himmah.feature_removal_receipts(digest) VALUES('${digest}');`,
  );
  return { digest, files, statements };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await removalPlan()));
