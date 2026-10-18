import type { VanillaBetterAuthClient } from "@neondatabase/auth";
// The managed Better Auth wrapper creates a tab identifier when imported.
// Import it only during browser interactions, never at Cloudflare module scope.
let client: Promise<VanillaBetterAuthClient> | undefined;
export async function authClient(): Promise<VanillaBetterAuthClient> {
  if (typeof window === "undefined")
    throw Error("Authentication client is only available in the browser.");
  client ??= Promise.all([
    import("@neondatabase/auth"),
    import("@neondatabase/auth/vanilla/adapters"),
  ]).then(([{ createAuthClient }, { BetterAuthVanillaAdapter }]) =>
    createAuthClient(`${window.location.origin}/api/auth`, {
      adapter: BetterAuthVanillaAdapter(),
    }),
  );
  try {
    return await client;
  } catch (error) {
    client = undefined;
    throw error;
  }
}
