import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import {
  SESSION_COOKIE_NAME,
  buildClearedSessionCookie,
  buildSessionCookie,
  createSession,
  deleteExpiredSessions,
  deleteSession,
  resolveSession,
  rotateSession,
} from "@/lib/session";

async function createUser(googleSub = "sub-test"): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub) VALUES (?) RETURNING id",
  )
    .bind(googleSub)
    .first<{ id: number }>();

  if (!row) throw new Error("failed to seed user");
  return row.id;
}

/** Backdates every session for a user so it is past its expiry. */
async function expireSessionsFor(userId: number): Promise<void> {
  await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
    .bind(new Date(Date.now() - 1000).toISOString(), userId)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
  await env.DB.prepare("DELETE FROM sessions").run();
});

test("stores a hash of the session token, never the token itself", async () => {
  const userId = await createUser();

  const { token } = await createSession(env.DB, userId);

  const stored = await env.DB.prepare("SELECT id_hash FROM sessions")
    .first<{ id_hash: string }>();

  expect(stored).not.toBeNull();
  expect(stored!.id_hash).not.toBe(token);
  expect(stored!.id_hash).toMatch(/^[0-9a-f]{64}$/);
});

test("issues a different token for every session", async () => {
  const userId = await createUser();

  const first = await createSession(env.DB, userId);
  const second = await createSession(env.DB, userId);

  expect(first.token).not.toBe(second.token);
});

test("resolves a valid token to its user", async () => {
  const userId = await createUser();
  const { token } = await createSession(env.DB, userId);

  const session = await resolveSession(env.DB, token);

  expect(session?.userId).toBe(userId);
});

test("does not resolve a token that was never issued", async () => {
  await createUser();

  const session = await resolveSession(env.DB, "not-a-real-token");

  expect(session).toBeNull();
});

test("does not resolve an expired session", async () => {
  const userId = await createUser();
  const { token } = await createSession(env.DB, userId);
  await expireSessionsFor(userId);

  const session = await resolveSession(env.DB, token);

  expect(session).toBeNull();
});

test("stops resolving a token once its session is deleted", async () => {
  const userId = await createUser();
  const { token } = await createSession(env.DB, userId);

  await deleteSession(env.DB, token);

  expect(await resolveSession(env.DB, token)).toBeNull();
});

test("leaves other sessions alone when one is deleted", async () => {
  const userId = await createUser();
  const doomed = await createSession(env.DB, userId);
  const survivor = await createSession(env.DB, userId);

  await deleteSession(env.DB, doomed.token);

  expect(await resolveSession(env.DB, survivor.token)).not.toBeNull();
});

test("rotation issues a new token for the same user", async () => {
  const userId = await createUser();
  const original = await createSession(env.DB, userId);

  const rotated = await rotateSession(env.DB, original.token);

  expect(rotated?.token).not.toBe(original.token);
  expect(await resolveSession(env.DB, rotated!.token)).toMatchObject({
    userId,
  });
});

test("rotation invalidates the old token", async () => {
  const userId = await createUser();
  const original = await createSession(env.DB, userId);

  await rotateSession(env.DB, original.token);

  expect(await resolveSession(env.DB, original.token)).toBeNull();
});

test("rotation refuses an expired token instead of minting a new session", async () => {
  const userId = await createUser();
  const original = await createSession(env.DB, userId);
  await expireSessionsFor(userId);

  const rotated = await rotateSession(env.DB, original.token);

  expect(rotated).toBeNull();
  const remaining = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM sessions",
  ).first<{ n: number }>();
  expect(remaining!.n).toBe(1);
});

test("session cookie is HttpOnly, SameSite=Lax, and Secure by default", () => {
  const cookie = buildSessionCookie({
    token: "tok",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  });

  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("Secure");
});

test("session cookie carries an explicit expiry matching the session", () => {
  const expiresAt = new Date("2099-01-01T00:00:00.000Z");

  const cookie = buildSessionCookie({ token: "tok", expiresAt });

  expect(cookie).toContain(`Expires=${expiresAt.toUTCString()}`);
});

test("session cookie drops Secure for plain-http local development", () => {
  const cookie = buildSessionCookie({
    token: "tok",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    secure: false,
  });

  expect(cookie).not.toContain("Secure");
  expect(cookie).toContain("HttpOnly");
});

test("session cookie carries the token under the session cookie name", () => {
  const cookie = buildSessionCookie({
    token: "tok-abc",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  });

  expect(cookie.startsWith(`${SESSION_COOKIE_NAME}=tok-abc;`)).toBe(true);
});

test("cleared cookie carries no token and expires immediately", () => {
  const cookie = buildClearedSessionCookie();

  expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
  expect(cookie).toContain("Max-Age=0");
  expect(cookie).toContain("HttpOnly");
});

test("sweeping expired sessions removes them and reports the count", async () => {
  const staleUser = await createUser("sub-stale");
  const activeUser = await createUser("sub-active");
  await createSession(env.DB, staleUser);
  await createSession(env.DB, staleUser);
  const active = await createSession(env.DB, activeUser);
  await expireSessionsFor(staleUser);

  const removed = await deleteExpiredSessions(env.DB);

  expect(removed).toBe(2);
  expect(await resolveSession(env.DB, active.token)).not.toBeNull();
});
