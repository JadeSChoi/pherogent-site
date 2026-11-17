import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // Keep the dependency scanner out of legacy/ (the retired Sites export).
  optimizeDeps: { entries: ["index.html"] },
});
