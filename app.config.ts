import { defineConfig } from "@tanstack/start/config";

/** Deployment hint for TanStack tooling; Cloudflare build uses `vite.config` + `@cloudflare/vite-plugin`. */
export default defineConfig({
  server: {
    preset: "cloudflare-pages",
  },
});