import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("migrations");

  return {
    test: {
      projects: [
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: { TEST_MIGRATIONS: migrations },
              },
            }),
          ],
          test: {
            name: "worker",
            include: ["tests/**/*.test.ts"],
            setupFiles: ["./tests/apply-migrations.ts"],
          },
        },
        {
          test: {
            name: "ui",
            include: ["src/**/*.test.{ts,tsx}"],
            environment: "jsdom",
            setupFiles: ["./src/test-setup.ts"],
            // @testing-library/react auto-registers its per-test cleanup only
            // when a global afterEach exists.
            globals: true,
          },
        },
      ],
    },
  };
});
