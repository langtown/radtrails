import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub) VALUES (?) RETURNING id",
  )
    .bind(googleSub)
    .first<{ id: number }>();

  if (!row) throw new Error("failed to seed user");
  return row.id;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("seeds exactly the five personas the site uses", async () => {
  const rows = await env.DB.prepare(
    "SELECT key FROM personas ORDER BY sort_order",
  ).all<{ key: string }>();

  expect(rows.results.map((r) => r.key)).toEqual([
    "member",
    "theteam",
    "coach",
    "alumni",
    "admin",
  ]);
});

test("member and admin are not public personas", async () => {
  const rows = await env.DB.prepare(
    "SELECT key FROM personas WHERE is_public = 0 ORDER BY sort_order",
  ).all<{ key: string }>();

  expect(rows.results.map((r) => r.key)).toEqual(["member", "admin"]);
});

test("theteam, coach, and alumni are the personas that appear publicly", async () => {
  const rows = await env.DB.prepare(
    "SELECT key FROM personas WHERE is_public = 1 ORDER BY sort_order",
  ).all<{ key: string }>();

  expect(rows.results.map((r) => r.key)).toEqual([
    "theteam",
    "coach",
    "alumni",
  ]);
});

test("a user can hold several personas at once", async () => {
  const userId = await createUser("sub-multi");

  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'coach'), (?, 'theteam')",
  )
    .bind(userId, userId)
    .run();

  const rows = await env.DB.prepare(
    "SELECT persona_key FROM user_personas WHERE user_id = ? ORDER BY persona_key",
  )
    .bind(userId)
    .all<{ persona_key: string }>();

  expect(rows.results.map((r) => r.persona_key)).toEqual(["coach", "theteam"]);
});

test("the same persona cannot be granted to a user twice", async () => {
  const userId = await createUser("sub-dup");
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'member')",
  )
    .bind(userId)
    .run();

  await expect(
    env.DB.prepare(
      "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'member')",
    )
      .bind(userId)
      .run(),
  ).rejects.toThrow(/UNIQUE/);
});

test("an unknown persona cannot be granted", async () => {
  const userId = await createUser("sub-bogus");

  await expect(
    env.DB.prepare(
      "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'superuser')",
    )
      .bind(userId)
      .run(),
  ).rejects.toThrow(/FOREIGN KEY/);
});

test("deleting a user removes their persona grants", async () => {
  const userId = await createUser("sub-cascade");
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'member')",
  )
    .bind(userId)
    .run();

  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

  const remaining = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM user_personas",
  ).first<{ n: number }>();
  expect(remaining!.n).toBe(0);
});

test("persona grants are indexed for listing everyone in a persona", async () => {
  const index = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'user_personas_persona_idx'",
  ).first<{ name: string }>();

  expect(index).not.toBeNull();
});
