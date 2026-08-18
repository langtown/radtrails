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

async function insertProfile(userId: number, slug: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO profiles (user_id, slug, display_name) VALUES (?, ?, ?)",
  )
    .bind(userId, slug, "Test Rider")
    .run();
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("a new profile starts as a draft, not published", async () => {
  const userId = await createUser("sub-draft");

  await insertProfile(userId, "test-rider");

  const row = await env.DB.prepare(
    "SELECT status FROM profiles WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ status: string }>();

  expect(row!.status).toBe("draft");
});

test("two users cannot claim the same slug", async () => {
  const first = await createUser("sub-one");
  const second = await createUser("sub-two");
  await insertProfile(first, "shared-slug");

  await expect(insertProfile(second, "shared-slug")).rejects.toThrow(/UNIQUE/);
});

test("a user has at most one profile", async () => {
  const userId = await createUser("sub-single");
  await insertProfile(userId, "first-slug");

  await expect(insertProfile(userId, "second-slug")).rejects.toThrow(/UNIQUE/);
});

test("deleting a user removes their profile", async () => {
  const userId = await createUser("sub-cascade");
  await insertProfile(userId, "doomed-slug");

  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

  const remaining = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM profiles",
  ).first<{ n: number }>();
  expect(remaining!.n).toBe(0);
});

test("a profile records who reviewed it and when", async () => {
  const owner = await createUser("sub-owner");
  const reviewer = await createUser("sub-reviewer");
  await insertProfile(owner, "reviewed-slug");

  await env.DB.prepare(
    "UPDATE profiles SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE user_id = ?",
  )
    .bind(reviewer, new Date().toISOString(), owner)
    .run();

  const row = await env.DB.prepare(
    "SELECT status, reviewed_by FROM profiles WHERE user_id = ?",
  )
    .bind(owner)
    .first<{ status: string; reviewed_by: number }>();

  expect(row!.status).toBe("approved");
  expect(row!.reviewed_by).toBe(reviewer);
});

test("profiles are indexed by status for the public listing", async () => {
  const index = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'profiles_status_idx'",
  ).first<{ name: string }>();

  expect(index).not.toBeNull();
});

test("social links default to a valid JSON object and reject invalid JSON", async () => {
  const userId = await createUser("sub-social-schema");
  await insertProfile(userId, "social-schema");

  const row = await env.DB.prepare(
    "SELECT social_links FROM profiles WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ social_links: string }>();
  expect(row?.social_links).toBe("{}");

  await expect(
    env.DB.prepare(
      "UPDATE profiles SET social_links = ? WHERE user_id = ?",
    )
      .bind("not-json", userId)
      .run(),
  ).rejects.toThrow();
});

test("profiles can retain private reviewer feedback", async () => {
  const userId = await createUser("sub-review-feedback");
  await insertProfile(userId, "review-feedback");

  await env.DB.prepare(
    "UPDATE profiles SET status = 'rejected', review_note = ? WHERE user_id = ?",
  )
    .bind("Please provide a clearer photo.", userId)
    .run();

  const row = await env.DB.prepare(
    "SELECT review_note FROM profiles WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ review_note: string | null }>();
  expect(row?.review_note).toBe("Please provide a clearer photo.");
});

test("the users table has no is_admin column; admin is a persona", async () => {
  const columns = await env.DB.prepare("PRAGMA table_info(users)").all<{
    name: string;
  }>();

  expect(columns.results.map((c) => c.name)).not.toContain("is_admin");
});
