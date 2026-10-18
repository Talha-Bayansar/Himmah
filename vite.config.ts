import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { paraglideOptions } from "./paraglide.config.js";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    paraglideVitePlugin(paraglideOptions),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({ server: { entry: "server.ts" } }),
    tailwindcss(),
    react(),
  ],
  server: { host: "0.0.0.0", port: 3101, strictPort: true },
});
