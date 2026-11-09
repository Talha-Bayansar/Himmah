import { readFile, readdir } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
export async function installDatabase(
  db: PGlite,
  {
    hosted = true,
    sessionFollowing = true,
    contactImport = true,
    sessionStarts = true,
  } = {},
) {
  for (const file of (await readdir("db/migrations/generated"))
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        (sessionFollowing ||
          (!f.startsWith("0010_") &&
            !f.startsWith("0016_") &&
            !f.startsWith("0017_"))) &&
        (sessionStarts || (!f.startsWith("0016_") && !f.startsWith("0017_"))) &&
        (contactImport || (!f.startsWith("0011_") && !f.startsWith("0012_"))),
    )
    .sort())
    await db.exec(await readFile("db/migrations/generated/" + file, "utf8"));
  for (const name of [
    "contacts",
    "directory",
    "communication",
    ...(hosted ? ["hosting"] : []),
  ])
    await db.exec(await readFile("db/rebuild/" + name + ".sql", "utf8"));
  for (const name of [
    "people-adapter",
    "access",
    "attendance",
    "notifications",
    "registration",
    "pricing",
    "cash",
    "billing",
    "participant-management",
    "activity-deletion",
    "recurrence",
    "session-cancellation",
    "learning",
    ...(contactImport ? ["contact-import"] : []),
    "live-quizzes",
    ...(sessionFollowing ? ["session-following"] : []),
    ...(contactImport ? ["custom-fields"] : []),
    "organization-settings",
    ...(sessionFollowing && sessionStarts ? ["session-starts"] : []),
  ])
    await db.exec(
      await readFile("db/migrations/functions/" + name + ".sql", "utf8"),
    );
}
