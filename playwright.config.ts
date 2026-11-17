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
    command: "npm run dev -- --port 5199 --host 127.0.0.1 --strictPort",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: !process.env.CI,
  },
});
