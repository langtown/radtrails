import {
  PersonaChangeError,
  requireAdminUser,
} from "./persona-admin";
import { hasPersona, type PersonaKey } from "./personas";
import { parseStoredSocialLinks, type SocialLinks } from "./profiles";

export const MAX_REVIEW_NOTE_CHARACTERS = 500;

const PRIVATE_NO_STORE = "private, no-store";
const REVIEW_FIELDS = ["action", "note"] as const;

export class ProfileReviewError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProfileReviewError";
    this.status = status;
  }
}

export type PendingProfile = {
  userId: number;
  slug: string;
  displayName: string;
  bio: string | null;
  imageUrl: string | null;
  imagePosition: string | null;
  socials: SocialLinks;
  personas: PersonaKey[];
  submittedAt: string | null;
};

export type ProfileReview = {
  actorId: number;
  profileUserId: number;
  action: "approve" | "reject";
  note: string | null;
};

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

function reviewErrorResponse(error: unknown): Response | null {
  if (
    error instanceof PersonaChangeError ||
    error instanceof ProfileReviewError
  ) {
    return privateJson({ error: error.message }, error.status);
  }
  return null;
}

/** Lists pending content only after confirming the actor still holds admin. */
export async function listPendingProfiles(
  db: D1Database,
  actorId: number,
): Promise<PendingProfile[]> {
  if (!(await hasPersona(db, actorId, "admin"))) {
    throw new ProfileReviewError("the admin persona is required", 403);
  }

  const { results } = await db
    .prepare(
      `SELECT p.user_id, p.slug, p.display_name, p.bio, p.image_key,
              p.image_position, p.social_links, p.submitted_at,
              up.persona_key
       FROM profiles p
       LEFT JOIN user_personas up ON up.user_id = p.user_id
       WHERE p.status = 'pending'
       ORDER BY p.submitted_at, p.user_id, up.persona_key`,
    )
    .all<{
      user_id: number;
      slug: string;
      display_name: string;
      bio: string | null;
      image_key: string | null;
      image_position: string | null;
      social_links: string;
      submitted_at: string | null;
      persona_key: PersonaKey | null;
    }>();

  const byUser = new Map<number, PendingProfile>();
  for (const row of results) {
    let profile = byUser.get(row.user_id);
    if (!profile) {
      profile = {
        userId: row.user_id,
        slug: row.slug,
        displayName: row.display_name,
        bio: row.bio,
        imageUrl: row.image_key
          ? `/api/profiles/image/${row.image_key}`
          : null,
        imagePosition: row.image_position,
        socials: parseStoredSocialLinks(row.social_links),
        personas: [],
        submittedAt: row.submitted_at,
      };
      byUser.set(row.user_id, profile);
    }
    if (row.persona_key) profile.personas.push(row.persona_key);
  }

  return [...byUser.values()];
}

function normalizeNote(value: unknown, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) {
      throw new ProfileReviewError(
        "rejection feedback is required",
        400,
      );
    }
    return null;
  }
  if (typeof value !== "string") {
    throw new ProfileReviewError("review note must be a string", 400);
  }

  const note = value.trim();
  if (required && note.length === 0) {
    throw new ProfileReviewError("rejection feedback is required", 400);
  }
  if (Array.from(note).length > MAX_REVIEW_NOTE_CHARACTERS) {
    throw new ProfileReviewError("review note is too long", 400);
  }
  if (/[<>\u0000-\u001f\u007f]/.test(note)) {
    throw new ProfileReviewError(
      "review note may not contain markup or control characters",
      400,
    );
  }
  return note || null;
}

function normalizeReviewBody(value: unknown): {
  action: "approve" | "reject";
  note: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProfileReviewError("review body must be an object", 400);
  }

  const record = value as Record<string, unknown>;
  const allowed = REVIEW_FIELDS as readonly string[];
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new ProfileReviewError("review body contains an unknown field", 400);
  }
  if (record.action !== "approve" && record.action !== "reject") {
    throw new ProfileReviewError("action must be approve or reject", 400);
  }

  return {
    action: record.action,
    note: normalizeNote(record.note, record.action === "reject"),
  };
}

/** Applies one decision; the admin check lives here as well as in the route. */
export async function reviewProfile(
  db: D1Database,
  { actorId, profileUserId, action, note }: ProfileReview,
): Promise<void> {
  if (!(await hasPersona(db, actorId, "admin"))) {
    throw new ProfileReviewError(
      "the admin persona is required to review profiles",
      403,
    );
  }
  if (!Number.isInteger(profileUserId) || profileUserId <= 0) {
    throw new ProfileReviewError("invalid profile id", 400);
  }

  if (action === "reject" && !note?.trim()) {
    throw new ProfileReviewError("rejection feedback is required", 400);
  }

  const reviewedAt = new Date().toISOString();

  if (action === "approve") {
    const [reviewed] = await db.batch([
      db
        .prepare(
          `UPDATE profiles
           SET status = 'approved', reviewed_at = ?, reviewed_by = ?,
               review_note = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND status = 'pending'`,
        )
        .bind(reviewedAt, actorId, profileUserId),
      db
        .prepare(
          `INSERT INTO published_profiles
             (user_id, slug, display_name, bio, image_key, image_position,
              social_links, published_at)
           SELECT user_id, slug, display_name, bio, image_key, image_position,
                  social_links, ?
           FROM profiles
           WHERE user_id = ? AND status = 'approved'
             AND reviewed_by = ? AND reviewed_at = ?
           ON CONFLICT (user_id) DO UPDATE SET
             slug = excluded.slug,
             display_name = excluded.display_name,
             bio = excluded.bio,
             image_key = excluded.image_key,
             image_position = excluded.image_position,
             social_links = excluded.social_links,
             published_at = excluded.published_at`,
        )
        .bind(reviewedAt, profileUserId, actorId, reviewedAt),
    ]);

    if ((reviewed.meta.changes ?? 0) === 0) {
      throw new ProfileReviewError(
        "profile is not waiting for review",
        409,
      );
    }
    return;
  }

  const result = await db
    .prepare(
      `UPDATE profiles
       SET status = 'rejected', reviewed_at = ?, reviewed_by = ?,
           review_note = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND status = 'pending'`,
    )
    .bind(
      reviewedAt,
      actorId,
      note,
      profileUserId,
    )
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new ProfileReviewError(
      "profile is not waiting for review",
      409,
    );
  }
}

/** HTTP behavior for GET /api/admin/profiles. */
export async function handleListPendingProfiles(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const actorId = await requireAdminUser(db, request);
    return privateJson({
      profiles: await listPendingProfiles(db, actorId),
    });
  } catch (error) {
    const response = reviewErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** HTTP behavior for POST /api/admin/profiles/:id/review. */
export async function handleReviewProfile(
  db: D1Database,
  request: Request,
  profileUserId: number,
  onReviewed?: (decision: {
    action: "approve" | "reject";
    profileUserId: number;
  }) => Promise<void>,
): Promise<Response> {
  try {
    const actorId = await requireAdminUser(db, request);
    const mediaType = request.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
      throw new ProfileReviewError(
        "Content-Type must be application/json",
        415,
      );
    }

    let raw: unknown;
    try {
      raw = (await request.json()) as unknown;
    } catch {
      throw new ProfileReviewError("request body must be valid JSON", 400);
    }
    const body = normalizeReviewBody(raw);
    await reviewProfile(db, {
      actorId,
      profileUserId,
      action: body.action,
      note: body.note,
    });
    await onReviewed?.({ action: body.action, profileUserId });

    return privateJson({
      ok: true,
      status: body.action === "approve" ? "approved" : "rejected",
    });
  } catch (error) {
    const response = reviewErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
