import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function schemaInstallPlan() {
  const files = [
    ...(await readdir("db/migrations/generated"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => "db/migrations/generated/" + f),
    ...["contacts", "directory", "communication", "hosting"].map(
      (f) => "db/rebuild/" + f + ".sql",
    ),
    ...[
      "people-adapter",
      "access",
      "attendance",
      "notifications",
      "registration",
    ].map((f) => "db/migrations/functions/" + f + ".sql"),
  ];
  const sources = await Promise.all(
    files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );
  const digest = createHash("sha256")
    .update(sources.map((s) => s.file + "\n" + s.source).join("\n"))
    .digest("hex");
  return {
    digest,
    files,
    statements: sources.map(
      ({ source }) =>
        `DO $install$ BEGIN EXECUTE $source$${source}$source$; END $install$;`,
    ),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await schemaInstallPlan()));
