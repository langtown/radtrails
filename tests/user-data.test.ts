import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import {
  MAX_DATA_ENTRIES,
  MAX_DATA_REQUEST_BYTES,
  MAX_DATA_VALUE_BYTES,
  handleGetData,
  handlePutData,
} from "@/lib/user-data";
import { SESSION_COOKIE_NAME, createSession } from "@/lib/session";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub) VALUES (?) RETURNING id",
  )
    .bind(googleSub)
    .first<{ id: number }>();

  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function requestForUser(
  userId: number,
  init: RequestInit = {},
): Promise<Request> {
  const { token } = await createSession(env.DB, userId);
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${SESSION_COOKIE_NAME}=${token}`);

  return new Request("https://radtrails.org/api/data", { ...init, headers });
}

async function putForUser(
  userId: number,
  body: unknown,
): Promise<Response> {
  return handlePutData(
    env.DB,
    await requestForUser(userId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("GET and PUT both require an authenticated session", async () => {
  const unsigned = new Request("https://radtrails.org/api/data");
  const unsignedPut = new Request("https://radtrails.org/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "bike", value: "hardtail" }),
  });

  expect((await handleGetData(env.DB, unsigned)).status).toBe(401);
  expect((await handlePutData(env.DB, unsignedPut)).status).toBe(401);
});

test("two users can use the same key without seeing each other's value", async () => {
  const first = await createUser("sub-data-one");
  const second = await createUser("sub-data-two");

  expect((await putForUser(first, { key: "bike", value: "hardtail" })).status).toBe(200);
  expect((await putForUser(second, { key: "bike", value: "enduro" })).status).toBe(200);

  const firstResponse = await handleGetData(
    env.DB,
    await requestForUser(first),
  );
  const secondResponse = await handleGetData(
    env.DB,
    await requestForUser(second),
  );

  expect(await firstResponse.json()).toMatchObject({
    data: [{ key: "bike", value: "hardtail" }],
  });
  expect(await secondResponse.json()).toMatchObject({
    data: [{ key: "bike", value: "enduro" }],
  });
});

test("PUT updates only the signed-in user's existing key", async () => {
  const first = await createUser("sub-update-one");
  const second = await createUser("sub-update-two");
  await putForUser(first, { key: "setting", value: "old" });
  await putForUser(second, { key: "setting", value: "other-user" });

  const response = await putForUser(first, {
    key: "setting",
    value: "new",
  });

  expect(response.status).toBe(200);
  const { results } = await env.DB.prepare(
    "SELECT user_id, data_value FROM user_data WHERE data_key = ? ORDER BY user_id",
  )
    .bind("setting")
    .all<{ user_id: number; data_value: string }>();
  expect(results).toEqual([
    { user_id: first, data_value: "new" },
    { user_id: second, data_value: "other-user" },
  ]);
});

test("client-supplied identity fields are rejected, never trusted", async () => {
  const first = await createUser("sub-identity-one");
  const second = await createUser("sub-identity-two");

  const response = await putForUser(first, {
    userId: second,
    key: "stolen",
    value: "attempt",
  });

  expect(response.status).toBe(400);
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM user_data",
  ).first<{ n: number }>();
  expect(count?.n).toBe(0);
});

test("SQL-looking keys round-trip as literal data", async () => {
  const userId = await createUser("sub-parameterized");
  const key = "x' OR 1=1 --";

  expect((await putForUser(userId, { key, value: "literal" })).status).toBe(200);

  const response = await handleGetData(
    env.DB,
    await requestForUser(userId),
  );
  expect(await response.json()).toMatchObject({
    data: [{ key, value: "literal" }],
  });
});

test("malformed JSON and non-JSON requests are rejected", async () => {
  const userId = await createUser("sub-bad-json");
  const malformed = await requestForUser(userId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  const wrongType = await requestForUser(userId, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ key: "a", value: "b" }),
  });

  expect((await handlePutData(env.DB, malformed)).status).toBe(400);
  expect((await handlePutData(env.DB, wrongType)).status).toBe(415);
});

test("payload fields must have exactly the expected string types", async () => {
  const userId = await createUser("sub-types");

  for (const body of [
    null,
    [],
    {},
    { key: 7, value: "ok" },
    { key: "ok", value: { nested: true } },
    { key: "ok", value: "ok", extra: true },
  ]) {
    expect((await putForUser(userId, body)).status).toBe(400);
  }
});

test("empty, padded, and control-character keys are rejected", async () => {
  const userId = await createUser("sub-keys");

  for (const key of ["", " padded", "padded ", "line\nbreak", "null\0byte"]) {
    expect((await putForUser(userId, { key, value: "ok" })).status).toBe(400);
  }
});

test("key and value limits are measured in UTF-8 bytes", async () => {
  const userId = await createUser("sub-byte-limits");

  // Each character is two UTF-8 bytes, so this exceeds a 128-byte key limit.
  expect(
    (await putForUser(userId, { key: "é".repeat(65), value: "ok" })).status,
  ).toBe(413);

  // Each emoji is four UTF-8 bytes.
  expect(
    (
      await putForUser(userId, {
        key: "large",
        value: "🚵".repeat(Math.floor(MAX_DATA_VALUE_BYTES / 4) + 1),
      })
    ).status,
  ).toBe(413);
});

test("the JSON request body itself is bounded before parsing", async () => {
  const userId = await createUser("sub-body-limit");
  const request = await requestForUser(userId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "large", value: "x".repeat(MAX_DATA_REQUEST_BYTES) }),
  });

  expect((await handlePutData(env.DB, request)).status).toBe(413);
});

test("a user cannot create more than the configured number of keys", async () => {
  const userId = await createUser("sub-key-cap");
  const statement = env.DB.prepare(
    "INSERT INTO user_data (user_id, data_key, data_value) VALUES (?, ?, ?)",
  );
  await env.DB.batch(
    Array.from({ length: MAX_DATA_ENTRIES }, (_, index) =>
      statement.bind(userId, `key-${index}`, "value"),
    ),
  );

  const rejected = await putForUser(userId, {
    key: "one-too-many",
    value: "value",
  });
  expect(rejected.status).toBe(409);

  // Existing entries remain editable even after the account reaches its cap.
  const updated = await putForUser(userId, {
    key: "key-0",
    value: "updated",
  });
  expect(updated.status).toBe(200);
});

test("successful responses are private and never cacheable", async () => {
  const userId = await createUser("sub-no-store");

  const put = await putForUser(userId, { key: "a", value: "b" });
  const get = await handleGetData(env.DB, await requestForUser(userId));

  expect(put.headers.get("Cache-Control")).toBe("private, no-store");
  expect(get.headers.get("Cache-Control")).toBe("private, no-store");
});
