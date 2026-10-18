"use client";
import {
  createAuthClient,
  type VanillaBetterAuthClient,
} from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";
let client: VanillaBetterAuthClient | undefined;
export function authClient() {
  if (typeof window === "undefined")
    throw Error("Authentication is available in the browser.");
  if (!client)
    client = createAuthClient(`${window.location.origin}/api/auth`, {
      adapter: BetterAuthVanillaAdapter(),
    });
  return client;
}
