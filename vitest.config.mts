import path from "node:path";
import { defineConfig } from "vitest/config";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";

// Tests run inside workerd against a real (in-memory) D1, seeded from the same
// checked-in migrations as local and production. A schema change that breaks
// the session layer therefore fails the suite rather than surfacing in prod.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        compatibilityDate: "2026-06-17",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.resolve("migrations")),
        },
      },
    })),
  ],
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json.
    alias: [{ find: /^@\/(.*)$/, replacement: `${path.resolve(".")}/$1` }],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/apply-migrations.ts"],
  },
});
