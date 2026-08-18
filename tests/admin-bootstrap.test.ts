import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import {
  claimFirstAdmin,
  handleBootstrapAdmin,
} from "@/lib/admin-bootstrap";
import { hasAnyAdmin } from "@/lib/persona-admin";
import { getUserPersonas } from "@/lib/personas";
import { SESSION_COOKIE_NAME, createSession } from "@/lib/session";

const SETUP_TOKEN = "correct-admin-bootstrap-token-1234567890";

async function createUser(sub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, email, display_name) VALUES (?, ?, ?) RETURNING id",
  )
    .bind(sub, `${sub}@example.com`, sub)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");

  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'member')",
  )
    .bind(row.id)
    .run();
  return row.id;
}

async function requestForUser(
  userId: number,
  body: unknown = { code: SETUP_TOKEN },
  init: RequestInit = {},
): Promise<Request> {
  const { token } = await createSession(env.DB, userId);
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${SESSION_COOKIE_NAME}=${token}`);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return new Request("https://radtrails.org/api/admin/bootstrap", {
    method: "POST",
    ...init,
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("the signed-in owner can claim the one-time initial admin", async () => {
  const owner = await createUser("bootstrap-owner");

  const response = await handleBootstrapAdmin(
    env.DB,
    await requestForUser(owner),
    SETUP_TOKEN,
  );

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    persona: "admin",
  });
  expect(await getUserPersonas(env.DB, owner)).toEqual(["admin", "member"]);
  expect(await hasAnyAdmin(env.DB)).toBe(true);
  const grant = await env.DB.prepare(
    "SELECT granted_by FROM user_personas WHERE user_id = ? AND persona_key = 'admin'",
  )
    .bind(owner)
    .first<{ granted_by: number | null }>();
  expect(grant?.granted_by).toBeNull();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

test("admin bootstrap requires an authenticated session", async () => {
  const response = await handleBootstrapAdmin(
    env.DB,
    new Request("https://radtrails.org/api/admin/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: SETUP_TOKEN }),
    }),
    SETUP_TOKEN,
  );

  expect(response.status).toBe(401);
  expect(await hasAnyAdmin(env.DB)).toBe(false);
});

test("a wrong setup code cannot grant admin", async () => {
  const user = await createUser("wrong-code");
  const response = await handleBootstrapAdmin(
    env.DB,
    await requestForUser(user, {
      code: "wrong-admin-bootstrap-token-1234567890",
    }),
    SETUP_TOKEN,
  );

  expect(response.status).toBe(403);
  expect(await getUserPersonas(env.DB, user)).toEqual(["member"]);
  expect(await hasAnyAdmin(env.DB)).toBe(false);
});

test("setup refuses a missing or weak configured token", async () => {
  const user = await createUser("missing-config");

  for (const configured of [undefined, "too-short"]) {
    const response = await handleBootstrapAdmin(
      env.DB,
      await requestForUser(user),
      configured,
    );
    expect(response.status).toBe(503);
  }

  expect(await hasAnyAdmin(env.DB)).toBe(false);
});

test("setup bodies are strict, JSON-only, and bounded", async () => {
  const user = await createUser("invalid-body");
  const cases: Array<[Request, number]> = [
    [
      await requestForUser(user, { code: SETUP_TOKEN }, {
        headers: { "Content-Type": "text/plain" },
      }),
      415,
    ],
    [await requestForUser(user, { code: SETUP_TOKEN, userId: user }), 400],
    [await requestForUser(user, { code: 42 }), 400],
    [await requestForUser(user, "not-json"), 400],
    [await requestForUser(user, { code: "x".repeat(3000) }), 413],
  ];

  for (const [request, expectedStatus] of cases) {
    expect(
      (await handleBootstrapAdmin(env.DB, request, SETUP_TOKEN)).status,
    ).toBe(expectedStatus);
  }
  expect(await hasAnyAdmin(env.DB)).toBe(false);
});

test("setup permanently closes after the first admin exists", async () => {
  const owner = await createUser("first-owner");
  const second = await createUser("second-owner");
  expect(await claimFirstAdmin(env.DB, owner)).toBe(true);

  const response = await handleBootstrapAdmin(
    env.DB,
    await requestForUser(second),
    SETUP_TOKEN,
  );

  expect(response.status).toBe(409);
  expect(await getUserPersonas(env.DB, owner)).toContain("admin");
  expect(await getUserPersonas(env.DB, second)).toEqual(["member"]);
});

test("concurrent bootstrap attempts can create only one admin", async () => {
  const first = await createUser("concurrent-first");
  const second = await createUser("concurrent-second");
  const [firstRequest, secondRequest] = await Promise.all([
    requestForUser(first),
    requestForUser(second),
  ]);

  const responses = await Promise.all([
    handleBootstrapAdmin(env.DB, firstRequest, SETUP_TOKEN),
    handleBootstrapAdmin(env.DB, secondRequest, SETUP_TOKEN),
  ]);
  const admins = await env.DB.prepare(
    "SELECT user_id FROM user_personas WHERE persona_key = 'admin'",
  ).all<{ user_id: number }>();

  expect(responses.map((response) => response.status).sort()).toEqual([
    201,
    409,
  ]);
  expect(admins.results).toHaveLength(1);
  expect([first, second]).toContain(admins.results[0]?.user_id);
});
