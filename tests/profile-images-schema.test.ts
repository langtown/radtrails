import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function insertImage(
  key: string,
  bytes: Uint8Array = PNG_BYTES,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO profile_images (image_key, content_type, byte_size, bytes) VALUES (?, ?, ?, ?)",
  )
    .bind(key, "image/png", bytes.byteLength, bytes)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM profile_images").run();
});

test("stores image bytes and returns them unchanged", async () => {
  await insertImage("hash-roundtrip");

  const row = await env.DB.prepare(
    "SELECT bytes, content_type, byte_size FROM profile_images WHERE image_key = ?",
  )
    .bind("hash-roundtrip")
    .first<{ bytes: ArrayBuffer; content_type: string; byte_size: number }>();

  expect(new Uint8Array(row!.bytes)).toEqual(PNG_BYTES);
  expect(row!.content_type).toBe("image/png");
  expect(row!.byte_size).toBe(PNG_BYTES.byteLength);
});

test("the same content hash cannot be stored twice", async () => {
  await insertImage("hash-duplicate");

  await expect(insertImage("hash-duplicate")).rejects.toThrow(/UNIQUE/);
});

test("a profile can reference a stored image by key", async () => {
  const user = await env.DB.prepare(
    "INSERT INTO users (google_sub) VALUES ('sub-image') RETURNING id",
  ).first<{ id: number }>();
  await insertImage("hash-linked");
  await env.DB.prepare(
    "INSERT INTO profiles (user_id, slug, display_name, image_key) VALUES (?, ?, ?, ?)",
  )
    .bind(user!.id, "linked-rider", "Linked Rider", "hash-linked")
    .run();

  const row = await env.DB.prepare(
    "SELECT p.display_name, i.content_type FROM profiles p JOIN profile_images i ON i.image_key = p.image_key WHERE p.user_id = ?",
  )
    .bind(user!.id)
    .first<{ display_name: string; content_type: string }>();

  expect(row!.display_name).toBe("Linked Rider");
  expect(row!.content_type).toBe("image/png");

  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user!.id).run();
});

test("an unreferenced image is identifiable for cleanup", async () => {
  await insertImage("hash-orphan");

  const orphans = await env.DB.prepare(
    "SELECT image_key FROM profile_images WHERE image_key NOT IN (SELECT image_key FROM profiles WHERE image_key IS NOT NULL)",
  ).all<{ image_key: string }>();

  expect(orphans.results.map((r) => r.image_key)).toContain("hash-orphan");
});
