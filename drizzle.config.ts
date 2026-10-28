import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/server/schema.ts", "./src/modules/people/schema.ts"],
  out: "./db/migrations/generated",
});
