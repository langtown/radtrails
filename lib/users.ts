import type { GoogleIdTokenClaims } from "./id-token";
import { grantDefaultPersona } from "./personas";

export type UpsertResult = {
  userId: number;
  isNewUser: boolean;
};

/**
 * Finds or creates the account behind a verified ID token.
 *
 * Keyed on `google_sub`, never email. A Google account's email can change, and
 * a Workspace address can be reassigned to a different person — keying on it
 * would either orphan someone's account or hand it to whoever inherits the
 * address. `sub` is immutable and never reused.
 *
 * Only ever called with claims that have already passed verifyIdToken().
 */
export async function upsertUserFromGoogle(
  db: D1Database,
  claims: GoogleIdTokenClaims,
): Promise<UpsertResult> {
  const existing = await db
    .prepare("SELECT id FROM users WHERE google_sub = ?")
    .bind(claims.sub)
    .first<{ id: number }>();

  if (existing) {
    // Refresh the display details; Google is the source of truth for them.
    await db
      .prepare(
        `UPDATE users
         SET email = ?, display_name = ?, picture_url = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        claims.email ?? null,
        claims.name ?? null,
        claims.picture ?? null,
        existing.id,
      )
      .run();

    return { userId: existing.id, isNewUser: false };
  }

  const created = await db
    .prepare(
      `INSERT INTO users (google_sub, email, display_name, picture_url)
       VALUES (?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      claims.sub,
      claims.email ?? null,
      claims.name ?? null,
      claims.picture ?? null,
    )
    .first<{ id: number }>();

  if (!created) {
    throw new Error("failed to create user record");
  }

  // Every account starts as a member: signed in, and visible nowhere public.
  await grantDefaultPersona(db, created.id);

  return { userId: created.id, isNewUser: true };
}
