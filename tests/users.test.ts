import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import { getUserPersonas } from "@/lib/personas";
import { upsertUserFromGoogle } from "@/lib/users";

const CLAIMS = {
  sub: "google-sub-abc",
  email: "rider@example.com",
  name: "Test Rider",
  picture: "https://example.com/a.jpg",
};

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("creates an account on first sign-in", async () => {
  const { userId, isNewUser } = await upsertUserFromGoogle(env.DB, CLAIMS);

  expect(isNewUser).toBe(true);

  const row = await env.DB.prepare(
    "SELECT google_sub, email, display_name, picture_url FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<{
      google_sub: string;
      email: string;
      display_name: string;
      picture_url: string;
    }>();

  expect(row!.google_sub).toBe(CLAIMS.sub);
  expect(row!.email).toBe(CLAIMS.email);
  expect(row!.display_name).toBe(CLAIMS.name);
  expect(row!.picture_url).toBe(CLAIMS.picture);
});

test("grants the member persona on first sign-in and nothing more", async () => {
  const { userId } = await upsertUserFromGoogle(env.DB, CLAIMS);

  expect(await getUserPersonas(env.DB, userId)).toEqual(["member"]);
});

test("signing in again returns the same account, not a second one", async () => {
  const first = await upsertUserFromGoogle(env.DB, CLAIMS);
  const second = await upsertUserFromGoogle(env.DB, CLAIMS);

  expect(second.userId).toBe(first.userId);
  expect(second.isNewUser).toBe(false);

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{
    n: number;
  }>();
  expect(count!.n).toBe(1);
});

test("a changed Google email updates the account rather than orphaning it", async () => {
  const first = await upsertUserFromGoogle(env.DB, CLAIMS);

  const second = await upsertUserFromGoogle(env.DB, {
    ...CLAIMS,
    email: "new-address@example.com",
  });

  expect(second.userId).toBe(first.userId);

  const row = await env.DB.prepare("SELECT email FROM users WHERE id = ?")
    .bind(first.userId)
    .first<{ email: string }>();
  expect(row!.email).toBe("new-address@example.com");
});

test("two Google accounts sharing an email stay separate people", async () => {
  // Email is not the identity; `sub` is. Distinct subs must never collapse.
  const first = await upsertUserFromGoogle(env.DB, CLAIMS);
  const second = await upsertUserFromGoogle(env.DB, {
    ...CLAIMS,
    sub: "google-sub-different",
  });

  expect(second.userId).not.toBe(first.userId);
});

test("signing in again does not wipe personas granted in the meantime", async () => {
  const { userId } = await upsertUserFromGoogle(env.DB, CLAIMS);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'theteam')",
  )
    .bind(userId)
    .run();

  await upsertUserFromGoogle(env.DB, CLAIMS);

  expect(await getUserPersonas(env.DB, userId)).toEqual(["member", "theteam"]);
});

test("a returning user's profile details are refreshed from Google", async () => {
  const { userId } = await upsertUserFromGoogle(env.DB, CLAIMS);

  await upsertUserFromGoogle(env.DB, { ...CLAIMS, name: "Renamed Rider" });

  const row = await env.DB.prepare(
    "SELECT display_name FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<{ display_name: string }>();
  expect(row!.display_name).toBe("Renamed Rider");
});
