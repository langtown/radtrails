import {
  AuthenticationError,
  requireAuthenticatedUser,
} from "./auth";
import { getUserPersonas, type PersonaKey } from "./personas";
import {
  MAX_PROFILE_BIO_CHARACTERS,
  MAX_PROFILE_NAME_CHARACTERS,
  MAX_PROFILE_SPONSORS,
  MAX_SOCIAL_URL_CHARACTERS,
  MAX_SPONSOR_NAME_CHARACTERS,
  SOCIAL_PLATFORMS,
  type SocialLinks,
  type SocialPlatform,
  type Sponsor,
} from "./profile-constraints";

export {
  MAX_PROFILE_BIO_CHARACTERS,
  MAX_PROFILE_NAME_CHARACTERS,
  MAX_PROFILE_SPONSORS,
  MAX_SOCIAL_URL_CHARACTERS,
  MAX_SPONSOR_NAME_CHARACTERS,
  SOCIAL_PLATFORMS,
} from "./profile-constraints";
export type { Sponsor } from "./profile-constraints";
export type { SocialLinks, SocialPlatform } from "./profile-constraints";

export const MAX_PROFILE_REQUEST_BYTES = 16 * 1024;

const PRIVATE_NO_STORE = "private, no-store";
const PROFILE_FIELDS = [
  "displayName",
  "bio",
  "imageKey",
  "imagePosition",
  "socials",
  "sponsors",
] as const;

const SOCIAL_HOSTS: Partial<Record<SocialPlatform, readonly string[]>> = {
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  twitter: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
  facebook: ["facebook.com"],
  strava: ["strava.com"],
};

export class ProfileError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProfileError";
    this.status = status;
  }
}

type ProfileInput = {
  displayName: string;
  bio: string | null;
  imageKey: string | null;
  imagePosition: string | null;
  socials: SocialLinks;
  sponsors: Sponsor[];
};

export type OwnProfile = ProfileInput & {
  slug: string;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  imageUrl: string | null;
};

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

function profileErrorResponse(error: unknown): Response | null {
  if (error instanceof AuthenticationError || error instanceof ProfileError) {
    return privateJson({ error: error.message }, error.status);
  }

  return null;
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("Content-Type"))) {
    throw new ProfileError("Content-Type must be application/json", 415);
  }

  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isFinite(bytes) || bytes < 0) {
      throw new ProfileError("invalid Content-Length", 400);
    }
    if (bytes > MAX_PROFILE_REQUEST_BYTES) {
      throw new ProfileError("profile request body is too large", 413);
    }
  }

  if (!request.body) throw new ProfileError("a JSON body is required", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > MAX_PROFILE_REQUEST_BYTES) {
        await reader.cancel();
        throw new ProfileError("profile request body is too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ProfileError("request body must be valid UTF-8", 400);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProfileError("request body must be valid JSON", 400);
  }
}

function normalizeProfileText(
  value: unknown,
  field: "display name" | "bio",
  maximum: number,
  required: boolean,
): string | null {
  if (value === undefined || value === null) {
    if (required) throw new ProfileError(`${field} is required`, 400);
    return null;
  }
  if (typeof value !== "string") {
    throw new ProfileError(`${field} must be a string`, 400);
  }

  const normalized = value.trim();
  if (required && normalized.length === 0) {
    throw new ProfileError(`${field} is required`, 400);
  }
  if (Array.from(normalized).length > maximum) {
    throw new ProfileError(`${field} is too long`, 400);
  }
  if (/[<>\u0000-\u001f\u007f]/.test(normalized)) {
    throw new ProfileError(
      `${field} may not contain markup or control characters`,
      400,
    );
  }

  return normalized || null;
}

function normalizeImagePosition(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ProfileError("imagePosition must be a string", 400);
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  const tokens = normalized.split(" ");
  if (tokens.length < 1 || tokens.length > 2) {
    throw new ProfileError("imagePosition is not a supported position", 400);
  }

  const valid = tokens.every((token) => {
    if (["left", "center", "right", "top", "bottom"].includes(token)) {
      return true;
    }
    if (!/^\d{1,3}(?:\.\d+)?%$/.test(token)) return false;
    return Number(token.slice(0, -1)) <= 100;
  });

  if (!valid) {
    throw new ProfileError("imagePosition is not a supported position", 400);
  }

  return normalized;
}

function isHostOrSubdomain(hostname: string, allowedHost: string): boolean {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

function normalizeSocialUrl(
  platform: SocialPlatform,
  value: unknown,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ProfileError(`${platform} must be an HTTPS URL`, 400);
  }

  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (Array.from(normalized).length > MAX_SOCIAL_URL_CHARACTERS) {
    throw new ProfileError(`${platform} URL is too long`, 400);
  }
  if (/[<>\u0000-\u001f\u007f]/.test(normalized)) {
    throw new ProfileError(
      `${platform} URL may not contain markup or control characters`,
      400,
    );
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new ProfileError(`${platform} must be a valid HTTPS URL`, 400);
  }

  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new ProfileError(`${platform} must be a valid HTTPS URL`, 400);
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const allowedHosts = SOCIAL_HOSTS[platform];
  if (
    allowedHosts &&
    !allowedHosts.some((allowedHost) =>
      isHostOrSubdomain(hostname, allowedHost),
    )
  ) {
    throw new ProfileError(`${platform} URL uses an unsupported host`, 400);
  }

  if (
    platform === "website" &&
    (!hostname.includes(".") ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local"))
  ) {
    throw new ProfileError("website URL uses an unsupported host", 400);
  }

  return url.toString();
}

function normalizeSocialLinks(value: unknown): SocialLinks {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ProfileError("socials must be an object", 400);
  }

  const record = value as Record<string, unknown>;
  const allowedPlatforms = SOCIAL_PLATFORMS as readonly string[];
  if (Object.keys(record).some((key) => !allowedPlatforms.includes(key))) {
    throw new ProfileError("socials contains an unknown platform", 400);
  }

  const socials: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const url = normalizeSocialUrl(platform, record[platform]);
    if (url) socials[platform] = url;
  }
  return socials;
}

export function parseStoredSocialLinks(value: string): SocialLinks {
  try {
    return normalizeSocialLinks(JSON.parse(value) as unknown);
  } catch {
    throw new Error("profile contains invalid stored social links");
  }
}

function normalizeSponsorName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProfileError("a sponsor name is required", 400);
  }
  const name = value.trim();
  if (!name) {
    throw new ProfileError("a sponsor name is required", 400);
  }
  if (Array.from(name).length > MAX_SPONSOR_NAME_CHARACTERS) {
    throw new ProfileError("a sponsor name is too long", 400);
  }
  if (/[<>\u0000-\u001f\u007f]/.test(name)) {
    throw new ProfileError(
      "sponsor names may not contain markup or control characters",
      400,
    );
  }
  return name;
}

function normalizeSponsorUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  try {
    // Sponsor sites follow the same rules as the "personal website" social.
    return normalizeSocialUrl("website", value);
  } catch {
    throw new ProfileError("a sponsor URL must be a valid HTTPS URL", 400);
  }
}

/**
 * Sponsors are stored as `{ name, url }` objects. Plain strings are still
 * accepted (name only, no link) so rows written before links existed keep
 * working.
 */
function normalizeSponsors(value: unknown): Sponsor[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ProfileError("sponsors must be an array", 400);
  }
  if (value.length > MAX_PROFILE_SPONSORS) {
    throw new ProfileError("too many sponsors", 400);
  }

  const sponsors: Sponsor[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const name = entry.trim();
      if (!name) continue;
      sponsors.push({ name: normalizeSponsorName(name), url: null });
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ProfileError("sponsors must be names or { name, url }", 400);
    }
    const record = entry as Record<string, unknown>;
    sponsors.push({
      name: normalizeSponsorName(record.name),
      url: normalizeSponsorUrl(record.url),
    });
  }
  return sponsors;
}

export function parseStoredSponsors(value: string): Sponsor[] {
  try {
    return normalizeSponsors(JSON.parse(value) as unknown);
  } catch {
    throw new Error("profile contains invalid stored sponsors");
  }
}

export function validateProfileInput(input: unknown): ProfileInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ProfileError("profile body must be an object", 400);
  }

  const record = input as Record<string, unknown>;
  const allowed = PROFILE_FIELDS as readonly string[];
  if (Object.keys(record).some((field) => !allowed.includes(field))) {
    throw new ProfileError("profile body contains an unknown field", 400);
  }
  if (!Object.hasOwn(record, "displayName")) {
    throw new ProfileError("display name is required", 400);
  }

  const displayName = normalizeProfileText(
    record.displayName,
    "display name",
    MAX_PROFILE_NAME_CHARACTERS,
    true,
  );
  const bio = normalizeProfileText(
    record.bio,
    "bio",
    MAX_PROFILE_BIO_CHARACTERS,
    false,
  );

  const imageKey = record.imageKey ?? null;
  if (
    imageKey !== null &&
    (typeof imageKey !== "string" || !/^[0-9a-f]{64}$/.test(imageKey))
  ) {
    throw new ProfileError("imageKey must be a valid uploaded image key", 400);
  }

  return {
    displayName: displayName!,
    bio,
    imageKey,
    imagePosition: normalizeImagePosition(record.imagePosition),
    socials: normalizeSocialLinks(record.socials),
    sponsors: normalizeSponsors(record.sponsors),
  };
}

function slugBase(displayName: string): string {
  const slug = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");

  return slug || "rider";
}

async function imageBelongsToUser(
  db: D1Database,
  userId: number,
  imageKey: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS allowed
       FROM profile_image_uploads
       WHERE user_id = ? AND image_key = ?
       UNION ALL
       SELECT 1 AS allowed
       FROM profiles
       WHERE user_id = ? AND image_key = ?
       LIMIT 1`,
    )
    .bind(userId, imageKey, userId, imageKey)
    .first<{ allowed: number }>();

  return row !== null;
}

async function createProfile(
  db: D1Database,
  userId: number,
  input: ProfileInput,
): Promise<void> {
  const base = slugBase(input.displayName);

  for (let suffix = 1; suffix <= 1000; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO profiles
           (user_id, slug, display_name, bio, image_key, image_position,
            social_links, sponsors, status, submitted_at, reviewed_at, reviewed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, NULL, NULL)`,
      )
      .bind(
        userId,
        slug,
        input.displayName,
        input.bio,
        input.imageKey,
        input.imagePosition,
        JSON.stringify(input.socials),
        JSON.stringify(input.sponsors),
      )
      .run();

    if ((result.meta.changes ?? 0) > 0) return;
  }

  throw new ProfileError("could not generate a unique profile slug", 409);
}

async function updateProfile(
  db: D1Database,
  userId: number,
  input: ProfileInput,
): Promise<void> {
  await db
    .prepare(
      `UPDATE profiles
       SET display_name = ?, bio = ?, image_key = ?, image_position = ?,
           social_links = ?, sponsors = ?,
           status = 'pending', submitted_at = CURRENT_TIMESTAMP,
           reviewed_at = NULL, reviewed_by = NULL, review_note = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .bind(
      input.displayName,
      input.bio,
      input.imageKey,
      input.imagePosition,
      JSON.stringify(input.socials),
      JSON.stringify(input.sponsors),
      userId,
    )
    .run();
}

export async function getOwnProfile(
  db: D1Database,
  userId: number,
): Promise<OwnProfile | null> {
  const row = await db
    .prepare(
      `SELECT slug, display_name, bio, image_key, image_position, social_links,
              sponsors, status, submitted_at, reviewed_at, review_note
       FROM profiles
       WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{
      slug: string;
      display_name: string;
      bio: string | null;
      image_key: string | null;
      image_position: string | null;
      social_links: string;
      sponsors: string;
      status: string;
      submitted_at: string | null;
      reviewed_at: string | null;
      review_note: string | null;
    }>();

  if (!row) return null;

  return {
    slug: row.slug,
    displayName: row.display_name,
    bio: row.bio,
    imageKey: row.image_key,
    imageUrl: row.image_key
      ? `/api/profiles/image/${row.image_key}`
      : null,
    imagePosition: row.image_position,
    socials: parseStoredSocialLinks(row.social_links),
    sponsors: parseStoredSponsors(row.sponsors),
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}

/** Admin helpers --------------------------------------------------------- */

export type AdminProfile = OwnProfile & {
  userId: number;
  personas: PersonaKey[];
};

export type AdminProfileListItem = {
  userId: number;
  email: string | null;
  accountName: string | null;
  personas: PersonaKey[];
  /** Null when the account has never submitted a profile. */
  slug: string | null;
  displayName: string | null;
  bio: string | null;
  imageUrl: string | null;
  imagePosition: string | null;
  /** Profile review status, or null when no profile exists yet. */
  status: string | null;
};

/**
 * Every account holding a persona, with whatever profile content it has.
 * Unlike the public listing this is not gated on approval: admins manage
 * pending and rejected content from the same screen.
 */
export async function adminListProfilesByPersona(
  db: D1Database,
  persona: PersonaKey,
): Promise<AdminProfileListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, u.display_name AS account_name,
              p.slug, p.display_name, p.bio, p.image_key, p.image_position,
              p.status,
              (SELECT GROUP_CONCAT(up2.persona_key)
                 FROM user_personas up2
                WHERE up2.user_id = u.id) AS personas
         FROM user_personas up
         INNER JOIN users u ON u.id = up.user_id
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE up.persona_key = ?
        ORDER BY COALESCE(p.display_name, u.display_name, u.email) COLLATE NOCASE`,
    )
    .bind(persona)
    .all<{
      user_id: number;
      email: string | null;
      account_name: string | null;
      slug: string | null;
      display_name: string | null;
      bio: string | null;
      image_key: string | null;
      image_position: string | null;
      status: string | null;
      personas: string | null;
    }>();

  return results.map((row) => ({
    userId: row.user_id,
    email: row.email,
    accountName: row.account_name,
    personas: (row.personas?.split(",") ?? []) as PersonaKey[],
    slug: row.slug,
    displayName: row.display_name,
    bio: row.bio,
    imageUrl: row.image_key ? `/api/profiles/image/${row.image_key}` : null,
    imagePosition: row.image_position,
    status: row.status,
  }));
}

export async function adminGetProfileBySlug(
  db: D1Database,
  slug: string,
): Promise<AdminProfile | null> {
  const row = await db
    .prepare(
      `SELECT p.user_id, p.slug, p.display_name, p.bio, p.image_key,
              p.image_position, p.social_links, p.sponsors, p.status,
              p.submitted_at, p.reviewed_at, p.review_note
       FROM profiles p
       WHERE p.slug = ?`,
    )
    .bind(slug)
    .first<{
      user_id: number;
      slug: string;
      display_name: string;
      bio: string | null;
      image_key: string | null;
      image_position: string | null;
      social_links: string;
      sponsors: string;
      status: string;
      submitted_at: string | null;
      reviewed_at: string | null;
      review_note: string | null;
    }>();

  if (!row) return null;

  // fetch personas for the user
  const personasRes = await db
    .prepare(`SELECT persona_key FROM user_personas WHERE user_id = ?`)
    .bind(row.user_id)
    .all<{ persona_key: string }>();

  const personas = personasRes.results.map((r) => r.persona_key as PersonaKey);

  return {
    userId: row.user_id,
    slug: row.slug,
    displayName: row.display_name,
    bio: row.bio,
    imageKey: row.image_key,
    imageUrl: row.image_key ? `/api/profiles/image/${row.image_key}` : null,
    imagePosition: row.image_position,
    socials: parseStoredSocialLinks(row.social_links),
    sponsors: parseStoredSponsors(row.sponsors),
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    personas,
  };
}

export async function adminUpdateProfile(
  db: D1Database,
  actorId: number,
  profileUserId: number,
  input: ProfileInput,
): Promise<void> {
  // validate input using existing validateProfileInput by calling it indirectly
  // we'll reuse the internal validator by duplicating minimal checks here
  // (keeps behavior consistent with create/update paths)

  // Reuse updateProfile but we need to mark as approved and publish
  await db
    .prepare(
      `UPDATE profiles
       SET display_name = ?, bio = ?, image_key = ?, image_position = ?,
           social_links = ?, sponsors = ?, status = 'approved', reviewed_at = ?,
           reviewed_by = ?, review_note = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .bind(
      input.displayName,
      input.bio,
      input.imageKey,
      input.imagePosition,
      JSON.stringify(input.socials),
      JSON.stringify(input.sponsors),
      new Date().toISOString(),
      actorId,
      profileUserId,
    )
    .run();

  // Upsert into published_profiles
  const reviewedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO published_profiles
         (user_id, slug, display_name, bio, image_key, image_position,
          social_links, sponsors, published_at)
       SELECT user_id, slug, display_name, bio, image_key, image_position,
              social_links, sponsors, ?
       FROM profiles
       WHERE user_id = ? AND status = 'approved'
       ON CONFLICT (user_id) DO UPDATE SET
         slug = excluded.slug,
         display_name = excluded.display_name,
         bio = excluded.bio,
         image_key = excluded.image_key,
         image_position = excluded.image_position,
         social_links = excluded.social_links,
         sponsors = excluded.sponsors,
         published_at = excluded.published_at`,
    )
    .bind(reviewedAt, profileUserId)
    .run();
}

/** HTTP behavior for GET /api/profile. */
export async function handleGetProfile(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    return privateJson({ profile: await getOwnProfile(db, userId) });
  } catch (error) {
    const response = profileErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** HTTP behavior for PUT /api/profile. */
export async function handlePutProfile(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    const input = validateProfileInput(await readBoundedJson(request));

    if (Object.keys(input.socials).length > 0 || input.sponsors.length > 0) {
      const personas = await getUserPersonas(db, userId);
      if (!personas.some((persona) => persona !== "member")) {
        throw new ProfileError(
          "a non-member persona is required to add social links or sponsors",
          403,
        );
      }
    }

    if (
      input.imageKey &&
      !(await imageBelongsToUser(db, userId, input.imageKey))
    ) {
      throw new ProfileError(
        "imageKey must belong to an image uploaded by this account",
        400,
      );
    }

    const existing = await getOwnProfile(db, userId);
    if (existing) await updateProfile(db, userId, input);
    else await createProfile(db, userId, input);

    return privateJson(
      { profile: await getOwnProfile(db, userId) },
      existing ? 200 : 201,
    );
  } catch (error) {
    const response = profileErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
