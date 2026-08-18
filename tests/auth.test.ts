import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import {
  AuthenticationError,
  handleGetMe,
  handleLogout,
  requireAuthenticatedUser,
} from "@/lib/auth";
import { grantDefaultPersona } from "@/lib/personas";
import {
  SESSION_COOKIE_NAME,
  createSession,
  resolveSession,
} from "@/lib/session";

async function createUser(googleSub = "sub-auth"): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO users (google_sub, email, display_name, picture_url)
     VALUES (?, ?, ?, ?)
     RETURNING id`,
  )
    .bind(
      googleSub,
      `${googleSub}@example.com`,
      "Test Rider",
      "https://example.com/rider.jpg",
    )
    .first<{ id: number }>();

  if (!row) throw new Error("failed to seed user");
  await grantDefaultPersona(env.DB, row.id);
  return row.id;
}

function requestWithToken(
  token: string,
  url = "https://radtrails.org/api/me",
): Request {
  return new Request(url, {
    method: url.endsWith("/logout") ? "POST" : "GET",
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("the auth guard rejects a request with no session", async () => {
  await expect(
    requireAuthenticatedUser(
      env.DB,
      new Request("https://radtrails.org/api/me"),
    ),
  ).rejects.toMatchObject({
    name: "AuthenticationError",
    status: 401,
  });
});

test("the auth guard rejects an unknown session token", async () => {
  await expect(
    requireAuthenticatedUser(env.DB, requestWithToken("forged-token")),
  ).rejects.toBeInstanceOf(AuthenticationError);
});

test("the auth guard rejects an expired session", async () => {
  const userId = await createUser();
  const { token } = await createSession(env.DB, userId);
  await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
    .bind(new Date(Date.now() - 1000).toISOString(), userId)
    .run();

  await expect(
    requireAuthenticatedUser(env.DB, requestWithToken(token)),
  ).rejects.toMatchObject({ status: 401 });
});

test("the auth guard resolves a real session to its internal user id", async () => {
  const userId = await createUser();
  const { token } = await createSession(env.DB, userId);

  await expect(
    requireAuthenticatedUser(env.DB, requestWithToken(token)),
  ).resolves.toBe(userId);
});

test("GET me returns 401 with no-store caching when signed out", async () => {
  const response = await handleGetMe(
    env.DB,
    new Request("https://radtrails.org/api/me"),
  );

  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  await expect(response.json()).resolves.toEqual({
    error: "authentication required",
  });
});

test("GET me returns the authenticated user's basic profile and personas", async () => {
  const userId = await createUser();
  const { token } = await createSession(env.DB, userId);

  const response = await handleGetMe(env.DB, requestWithToken(token));

  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  await expect(response.json()).resolves.toEqual({
    email: "sub-auth@example.com",
    displayName: "Test Rider",
    pictureUrl: "https://example.com/rider.jpg",
    personas: ["member"],
  });
});

test("GET me never exposes the Google subject or internal user id", async () => {
  const userId = await createUser("immutable-google-subject");
  await env.DB.prepare("UPDATE users SET email = ? WHERE id = ?")
    .bind("rider@example.com", userId)
    .run();
  const { token } = await createSession(env.DB, userId);

  const response = await handleGetMe(env.DB, requestWithToken(token));
  const body = await response.json<Record<string, unknown>>();

  expect(body).not.toHaveProperty("id");
  expect(body).not.toHaveProperty("userId");
  expect(body).not.toHaveProperty("googleSub");
  expect(JSON.stringify(body)).not.toContain("immutable-google-subject");
});

test("logout deletes the presented session and makes its token unusable", async () => {
  const userId = await createUser();
  const signedOut = await createSession(env.DB, userId);
  const survivor = await createSession(env.DB, userId);

  const response = await handleLogout(
    env.DB,
    requestWithToken(
      signedOut.token,
      "https://radtrails.org/api/auth/logout",
    ),
  );

  expect(response.status).toBe(303);
  expect(await resolveSession(env.DB, signedOut.token)).toBeNull();
  expect(await resolveSession(env.DB, survivor.token)).not.toBeNull();
});

test("logout clears the browser cookie with its security attributes", async () => {
  const response = await handleLogout(
    env.DB,
    new Request("https://radtrails.org/api/auth/logout", { method: "POST" }),
  );

  const cookie = response.headers.get("Set-Cookie");
  expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
  expect(cookie).toContain("Max-Age=0");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("Secure");
  expect(response.headers.get("Location")).toBe("/");
});

test("logout clears a local-http cookie without the Secure attribute", async () => {
  const response = await handleLogout(
    env.DB,
    new Request("http://localhost:3000/api/auth/logout", { method: "POST" }),
  );

  expect(response.headers.get("Set-Cookie")).not.toContain("Secure");
});
