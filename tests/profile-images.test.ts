import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import {
  IMMUTABLE_IMAGE_CACHE_CONTROL,
  MAX_PROFILE_IMAGE_BYTES,
  getProfileImageResponse,
  handleProfileImageUpload,
} from "@/lib/profile-images";
import { SESSION_COOKIE_NAME, createSession } from "@/lib/session";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

const JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9,
]);

const WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
]);

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub) VALUES (?) RETURNING id",
  )
    .bind(googleSub)
    .first<{ id: number }>();

  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function uploadRequest(
  userId: number,
  bytes: Uint8Array,
  contentType: string,
): Promise<Request> {
  const { token } = await createSession(env.DB, userId);
  const body = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  body.set(bytes);

  return new Request("https://radtrails.org/api/profile/image", {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
    body,
  });
}

async function upload(
  userId: number,
  bytes = PNG_BYTES,
  contentType = "image/png",
): Promise<Response> {
  return handleProfileImageUpload(
    env.DB,
    await uploadRequest(userId, bytes, contentType),
  );
}

async function imageCounts(): Promise<{ images: number; pending: number }> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM profile_images) AS images,
       (SELECT COUNT(*) FROM profile_image_uploads) AS pending`,
  ).first<{ images: number; pending: number }>();

  return row ?? { images: -1, pending: -1 };
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
  await env.DB.prepare("DELETE FROM profile_image_uploads").run();
  await env.DB.prepare("DELETE FROM profile_images").run();
});

test("an unauthenticated upload returns 401 before writing", async () => {
  const response = await handleProfileImageUpload(
    env.DB,
    new Request("https://radtrails.org/api/profile/image", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: PNG_BYTES,
    }),
  );

  expect(response.status).toBe(401);
  expect(await imageCounts()).toEqual({ images: 0, pending: 0 });
});

test.each([
  ["image/png", PNG_BYTES],
  ["image/jpeg", JPEG_BYTES],
  ["image/webp", WEBP_BYTES],
] as const)("stores a sniffed %s upload", async (contentType, bytes) => {
  const userId = await createUser(`sub-${contentType}`);

  const response = await upload(userId, bytes, contentType);

  expect(response.status).toBe(201);
  const body = await response.json<{ imageKey: string; url: string }>();
  expect(body.imageKey).toMatch(/^[0-9a-f]{64}$/);
  expect(body.url).toBe(`/api/profiles/image/${body.imageKey}`);

  const row = await env.DB.prepare(
    "SELECT content_type, byte_size, bytes FROM profile_images WHERE image_key = ?",
  )
    .bind(body.imageKey)
    .first<{ content_type: string; byte_size: number; bytes: ArrayBuffer }>();
  expect(row?.content_type).toBe(contentType);
  expect(row?.byte_size).toBe(bytes.byteLength);
  expect(new Uint8Array(row!.bytes)).toEqual(bytes);
});

test("the image key is the SHA-256 hash of the exact bytes", async () => {
  const userId = await createUser("sub-content-hash");
  const response = await upload(userId);
  const body = await response.json<{ imageKey: string }>();
  const digest = await crypto.subtle.digest("SHA-256", PNG_BYTES);
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  expect(body.imageKey).toBe(expected);
});

test("non-images and unsupported image types are rejected before a write", async () => {
  const userId = await createUser("sub-not-image");

  const notImage = await upload(
    userId,
    new TextEncoder().encode("not really a png"),
    "image/png",
  );
  const gif = await upload(
    userId,
    Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    "image/gif",
  );

  expect(notImage.status).toBe(415);
  expect(gif.status).toBe(415);
  expect(await imageCounts()).toEqual({ images: 0, pending: 0 });
});

test("a declared content type that disagrees with the bytes is rejected", async () => {
  const userId = await createUser("sub-spoofed-type");

  const response = await upload(userId, PNG_BYTES, "image/jpeg");

  expect(response.status).toBe(415);
  expect(await imageCounts()).toEqual({ images: 0, pending: 0 });
});

test("an oversized phone photo gets an actionable 413 before a write", async () => {
  const userId = await createUser("sub-large-photo");
  const bytes = new Uint8Array(MAX_PROFILE_IMAGE_BYTES + 1);
  bytes.set(JPEG_BYTES.slice(0, 4), 0);
  bytes.set(JPEG_BYTES.slice(-2), bytes.byteLength - 2);

  const response = await upload(userId, bytes, "image/jpeg");

  expect(response.status).toBe(413);
  expect(await response.text()).toMatch(/smaller|compress|1 MB/i);
  expect(await imageCounts()).toEqual({ images: 0, pending: 0 });
});

test("repeated unattached uploads leave only the user's latest blob", async () => {
  const userId = await createUser("sub-reuploads");
  await upload(userId, PNG_BYTES, "image/png");
  await upload(userId, JPEG_BYTES, "image/jpeg");
  await upload(userId, WEBP_BYTES, "image/webp");

  expect(await imageCounts()).toEqual({ images: 1, pending: 1 });
  const pending = await env.DB.prepare(
    "SELECT pi.content_type FROM profile_image_uploads pu JOIN profile_images pi ON pi.image_key = pu.image_key WHERE pu.user_id = ?",
  )
    .bind(userId)
    .first<{ content_type: string }>();
  expect(pending?.content_type).toBe("image/webp");
});

test("a blob referenced by a profile survives later upload cleanup", async () => {
  const userId = await createUser("sub-profile-reference");
  const first = await upload(userId, PNG_BYTES, "image/png");
  const { imageKey } = await first.json<{ imageKey: string }>();
  await env.DB.prepare(
    "INSERT INTO profiles (user_id, slug, display_name, image_key) VALUES (?, ?, ?, ?)",
  )
    .bind(userId, "image-owner", "Image Owner", imageKey)
    .run();

  await upload(userId, JPEG_BYTES, "image/jpeg");

  expect(await imageCounts()).toEqual({ images: 2, pending: 1 });
  expect(
    await env.DB.prepare(
      "SELECT 1 AS found FROM profile_images WHERE image_key = ?",
    )
      .bind(imageKey)
      .first(),
  ).not.toBeNull();
});

test("an image in the last approved snapshot survives draft upload cleanup", async () => {
  const userId = await createUser("sub-published-image-reference");
  const first = await upload(userId, PNG_BYTES, "image/png");
  const { imageKey } = await first.json<{ imageKey: string }>();
  await env.DB.prepare(
    "INSERT INTO profiles (user_id, slug, display_name) VALUES (?, ?, ?)",
  )
    .bind(userId, "published-image-owner", "Published Image Owner")
    .run();
  await env.DB.prepare(
    `INSERT INTO published_profiles
       (user_id, slug, display_name, image_key, published_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  )
    .bind(userId, "published-image-owner", "Published Image Owner", imageKey)
    .run();

  await upload(userId, JPEG_BYTES, "image/jpeg");

  expect(await imageCounts()).toEqual({ images: 2, pending: 1 });
  expect(
    await env.DB.prepare(
      "SELECT 1 AS found FROM profile_images WHERE image_key = ?",
    )
      .bind(imageKey)
      .first(),
  ).not.toBeNull();
});

test("identical content is deduplicated safely across users", async () => {
  const first = await createUser("sub-dedupe-one");
  const second = await createUser("sub-dedupe-two");

  const firstKey = await (await upload(first)).json<{ imageKey: string }>();
  const secondKey = await (await upload(second)).json<{ imageKey: string }>();

  expect(secondKey.imageKey).toBe(firstKey.imageKey);
  expect(await imageCounts()).toEqual({ images: 1, pending: 2 });
});

test("public image reads return exact bytes with immutable security headers", async () => {
  const userId = await createUser("sub-read-image");
  const uploaded = await upload(userId);
  const { imageKey } = await uploaded.json<{ imageKey: string }>();

  const response = await getProfileImageResponse(env.DB, imageKey);

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/png");
  expect(response.headers.get("Content-Length")).toBe(String(PNG_BYTES.byteLength));
  expect(response.headers.get("Cache-Control")).toBe(
    IMMUTABLE_IMAGE_CACHE_CONTROL,
  );
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("ETag")).toBe(`"${imageKey}"`);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
});

test("invalid and unknown image keys return a cache-safe 404", async () => {
  const invalid = await getProfileImageResponse(env.DB, "not-a-hash");
  const missing = await getProfileImageResponse(env.DB, "a".repeat(64));

  expect(invalid.status).toBe(404);
  expect(missing.status).toBe(404);
  expect(invalid.headers.get("Cache-Control")).toBe("no-store");
});
