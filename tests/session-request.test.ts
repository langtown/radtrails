import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import {
  SESSION_COOKIE_NAME,
  createSession,
  readSessionToken,
  resolveSessionFromRequest,
} from "@/lib/session";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub) VALUES (?) RETURNING id",
  )
    .bind(googleSub)
    .first<{ id: number }>();

  if (!row) throw new Error("failed to seed user");
  return row.id;
}

function requestWithCookie(cookie: string): Request {
  return new Request("https://radtrails.org/api/admin/users", {
    headers: { Cookie: cookie },
  });
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("reads the session token out of the cookie header", () => {
  const request = requestWithCookie(`${SESSION_COOKIE_NAME}=abc123`);

  expect(readSessionToken(request)).toBe("abc123");
});

test("finds the session cookie alongside unrelated cookies", () => {
  const request = requestWithCookie(
    `_ga=GA1.1.99; ${SESSION_COOKIE_NAME}=abc123; theme=dark`,
  );

  expect(readSessionToken(request)).toBe("abc123");
});

test("is not fooled by a cookie whose name merely ends with the session name", () => {
  const request = requestWithCookie(`evil_${SESSION_COOKIE_NAME}=attacker`);

  expect(readSessionToken(request)).toBeNull();
});

test("returns null when the request carries no cookies at all", () => {
  const request = new Request("https://radtrails.org/api/admin/users");

  expect(readSessionToken(request)).toBeNull();
});

test("resolves a request carrying a real session to its user", async () => {
  const userId = await createUser("sub-request");
  const { token } = await createSession(env.DB, userId);

  const session = await resolveSessionFromRequest(
    env.DB,
    requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`),
  );

  expect(session?.userId).toBe(userId);
});

test("resolves to null when the cookie holds a token that was never issued", async () => {
  await createUser("sub-forged");

  const session = await resolveSessionFromRequest(
    env.DB,
    requestWithCookie(`${SESSION_COOKIE_NAME}=forged-token`),
  );

  expect(session).toBeNull();
});
