import { defineConfig } from "drizzle-kit";
// Generation only. Never infer a remote database from inherited credentials.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/people/schema.ts",
  out: "./db/rebuild/generated",
});
