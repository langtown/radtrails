import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// TEST_MIGRATIONS is injected by vitest.config.mts and exists only under test,
// so it is read through a cast rather than widening the production Env type.
const { TEST_MIGRATIONS } = env as unknown as {
  TEST_MIGRATIONS: D1Migration[];
};

// Runs once per test worker, before any test file.
await applyD1Migrations(env.DB, TEST_MIGRATIONS);
