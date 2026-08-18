import {
  AuthenticationError,
  requireAuthenticatedUser,
} from "./auth";
import { PersonaChangeError, requireAdminUser } from "./persona-admin";
import {
  MAX_PROFILE_IMAGE_BYTES,
  PROFILE_IMAGE_TYPES,
  type ProfileImageType,
} from "./profile-constraints";
import { adminGetProfileBySlug } from "./profiles";

export { MAX_PROFILE_IMAGE_BYTES } from "./profile-constraints";
export const IMMUTABLE_IMAGE_CACHE_CONTROL =
  "public, max-age=31536000, immutable";

const ALLOWED_IMAGE_TYPES = PROFILE_IMAGE_TYPES;
type AllowedImageType = ProfileImageType;

export class ProfileImageError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProfileImageError";
    this.status = status;
  }
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function imageErrorResponse(error: unknown): Response | null {
  if (
    error instanceof AuthenticationError ||
    error instanceof ProfileImageError ||
    error instanceof PersonaChangeError
  ) {
    return json({ error: error.message }, error.status);
  }

  return null;
}

function normalizeContentType(value: string | null): AllowedImageType | null {
  const mediaType = value?.split(";", 1)[0].trim().toLowerCase();
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mediaType ?? "")
    ? (mediaType as AllowedImageType)
    : null;
}

function matches(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function uint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

/** Identifies supported formats from their container bytes, never filenames. */
export function sniffImageContentType(
  bytes: Uint8Array,
): AllowedImageType | null {
  if (
    bytes.byteLength >= 24 &&
    matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    ascii(bytes, 12, 4) === "IHDR"
  ) {
    return "image/png";
  }

  if (
    bytes.byteLength >= 8 &&
    matches(bytes, 0, [0xff, 0xd8, 0xff]) &&
    matches(bytes, bytes.byteLength - 2, [0xff, 0xd9])
  ) {
    return "image/jpeg";
  }

  if (
    bytes.byteLength >= 16 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(ascii(bytes, 12, 4)) &&
    uint32LittleEndian(bytes, 4) === bytes.byteLength - 8
  ) {
    return "image/webp";
  }

  return null;
}

/** Streams at most 1 MiB into memory, rejecting dishonest chunked bodies too. */
async function readImageBytes(
  request: Request,
): Promise<Uint8Array<ArrayBuffer>> {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isFinite(bytes) || bytes < 0) {
      throw new ProfileImageError("invalid Content-Length", 400);
    }
    if (bytes > MAX_PROFILE_IMAGE_BYTES) {
      throw new ProfileImageError(
        "Image is too large. Please resize or compress it to 1 MB or smaller.",
        413,
      );
    }
  }

  if (!request.body) throw new ProfileImageError("image bytes are required", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > MAX_PROFILE_IMAGE_BYTES) {
        await reader.cancel();
        throw new ProfileImageError(
          "Image is too large. Please resize or compress it to 1 MB or smaller.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) throw new ProfileImageError("image bytes are required", 400);

  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function storeProfileImage(
  db: D1Database,
  userId: number,
  contentType: AllowedImageType,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const imageKey = await sha256Hex(bytes);

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO profile_images
           (image_key, content_type, byte_size, bytes)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(imageKey, contentType, bytes.byteLength, bytes),
    db
      .prepare(
        `INSERT INTO profile_image_uploads (user_id, image_key, uploaded_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET
           image_key = excluded.image_key,
           uploaded_at = CURRENT_TIMESTAMP`,
      )
      .bind(userId, imageKey),
    db.prepare(
      `DELETE FROM profile_images
       WHERE image_key NOT IN (
         SELECT image_key FROM profiles WHERE image_key IS NOT NULL
       )
       AND image_key NOT IN (
         SELECT image_key FROM published_profiles WHERE image_key IS NOT NULL
       )
       AND image_key NOT IN (
         SELECT image_key FROM profile_image_uploads
       )`,
    ),
  ]);

  return imageKey;
}

async function uploadValidatedImage(
  db: D1Database,
  request: Request,
  userId: number,
): Promise<Response> {
  const declaredType = normalizeContentType(
    request.headers.get("Content-Type"),
  );
  if (!declaredType) {
    throw new ProfileImageError(
      "Please upload a JPEG, PNG, or WebP image.",
      415,
    );
  }

  const bytes = await readImageBytes(request);
  const sniffedType = sniffImageContentType(bytes);
  if (!sniffedType) {
    throw new ProfileImageError(
      "The uploaded bytes are not a valid JPEG, PNG, or WebP image.",
      415,
    );
  }
  if (sniffedType !== declaredType) {
    throw new ProfileImageError(
      "The image bytes do not match the declared Content-Type.",
      415,
    );
  }

  const imageKey = await storeProfileImage(db, userId, sniffedType, bytes);
  return json({ imageKey, url: `/api/profiles/image/${imageKey}` }, 201);
}

/** HTTP behavior for POST /api/profile/image. */
export async function handleProfileImageUpload(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    return await uploadValidatedImage(db, request, userId);
  } catch (error) {
    const response = imageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/**
 * HTTP behavior for POST /api/admin/profiles/:slug/image.
 *
 * The image is recorded against the profile owner's account, not the
 * admin's: ownership checks elsewhere (e.g. imageBelongsToUser) keep working
 * exactly as if the owner had uploaded it themselves. The admin check runs
 * before the slug lookup so a non-admin cannot probe for profile existence.
 */
export async function handleAdminProfileImageUpload(
  db: D1Database,
  request: Request,
  slug: string,
): Promise<Response> {
  try {
    await requireAdminUser(db, request);
    const profile = await adminGetProfileBySlug(db, slug);
    if (!profile) {
      throw new ProfileImageError("profile not found", 404);
    }
    return await uploadValidatedImage(db, request, profile.userId);
  } catch (error) {
    const response = imageErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** Public immutable read behavior for GET /api/profiles/image/[key]. */
export async function getProfileImageResponse(
  db: D1Database,
  imageKey: string,
): Promise<Response> {
  if (!/^[0-9a-f]{64}$/.test(imageKey)) {
    return Response.json(
      { error: "image not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const row = await db
    .prepare(
      "SELECT content_type, byte_size, bytes FROM profile_images WHERE image_key = ?",
    )
    .bind(imageKey)
    .first<{
      content_type: AllowedImageType;
      byte_size: number;
      bytes: ArrayBuffer;
    }>();

  if (!row) {
    return Response.json(
      { error: "image not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return new Response(new Uint8Array(row.bytes), {
    headers: {
      "Cache-Control": IMMUTABLE_IMAGE_CACHE_CONTROL,
      "Content-Length": String(row.byte_size),
      "Content-Type": row.content_type,
      ETag: `"${imageKey}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
