import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5199",
    browserName: "chromium",
  },
  webServer: {
    // The e2e config serves the same app through the e2e Worker entry, whose
    // injected fake provider keeps AI and Europe PMC traffic on this machine.
    command:
      "npm run dev -- --config vite.e2e.config.ts --port 5199 --host 127.0.0.1 --strictPort",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: !process.env.CI,
  },
});
