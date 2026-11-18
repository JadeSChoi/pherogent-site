import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Playwright dev-server configuration: identical to vite.config.ts but
// serving the e2e Worker entry (wrangler.e2e.jsonc), whose injected fake
// provider keeps every AI and Europe PMC call on this machine.
export default defineConfig({
  plugins: [react(), cloudflare({ configPath: "./wrangler.e2e.jsonc" })],
  optimizeDeps: { entries: ["index.html"] },
});
