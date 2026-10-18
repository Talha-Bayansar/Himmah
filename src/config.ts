/** Explicit project-only bindings prevent accidental use of another app's database. */
export function readDatabaseConfig(env: Record<string, string | undefined>) {
  const pooled = env.HIMMAH_DATABASE_URL;
  const direct = env.HIMMAH_DATABASE_URL_UNPOOLED;
  if (!pooled || !direct) {
    throw new Error(
      "Missing Himmah Futsal database configuration. Set HIMMAH_DATABASE_URL and HIMMAH_DATABASE_URL_UNPOOLED; generic DATABASE_URL is never used.",
    );
  }
  for (const value of [pooled, direct]) {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      throw new Error("Himmah database bindings must be PostgreSQL URLs.");
    }
  }
  return { pooled, direct };
}
