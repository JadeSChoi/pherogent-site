'use strict';
const { defineConfig } = require('playwright/test');
const externalURL = process.env.PHEROGENT_TEST_URL;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.cjs',
  timeout: 30000,
  fullyParallel: true,
  use: { baseURL: externalURL || 'http://127.0.0.1:8000', browserName: 'chromium' },
  webServer: externalURL ? undefined : {
    command: 'npm run dev -- --port 8000 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: false,
  },
});
