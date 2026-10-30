import { readFile, readdir } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
export async function installDatabase(db: PGlite, { hosted = true } = {}) {
  for (const file of (await readdir("db/migrations/generated"))
    .filter((f) => f.endsWith(".sql"))
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
  ])
    await db.exec(
      await readFile("db/migrations/functions/" + name + ".sql", "utf8"),
    );
}
