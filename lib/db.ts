import { getCloudflareContext } from "@opennextjs/cloudflare";

export type AppRuntime = {
  db: D1Database;
  adminBootstrapToken: string | undefined;
  rateLimiters: {
    login: RateLimit | undefined;
    write: RateLimit | undefined;
    image: RateLimit | undefined;
  };
  waitUntil: (promise: Promise<unknown>) => void;
};

/**
 * The application D1 database (users, sessions, per-user data).
 *
 * Always use the async form of getCloudflareContext: the synchronous one is
 * unavailable while Next.js is statically rendering routes at build time, and
 * every caller here is already inside an async route handler.
 */
export async function getAppRuntime(): Promise<AppRuntime> {
  const { env, ctx } = await getCloudflareContext({ async: true });

  if (!env.DB) {
    throw new Error(
      "D1 binding DB is missing. Check d1_databases in wrangler.jsonc, " +
        "and run `npm run db:migrate:local` before `npm run dev`.",
    );
  }

  return {
    db: env.DB,
    adminBootstrapToken:
      "ADMIN_BOOTSTRAP_TOKEN" in env &&
      typeof env.ADMIN_BOOTSTRAP_TOKEN === "string"
        ? env.ADMIN_BOOTSTRAP_TOKEN
        : undefined,
    rateLimiters: {
      login: env.LOGIN_RATE_LIMITER,
      write: env.WRITE_RATE_LIMITER,
      image: env.IMAGE_RATE_LIMITER,
    },
    waitUntil: (promise) => ctx.waitUntil(promise),
  };
}

export async function getDb(): Promise<D1Database> {
  return (await getAppRuntime()).db;
}
