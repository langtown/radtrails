/**
 * Personas decide whether and where a user appears on the public site.
 *
 * They are the first of two independent gates. This one answers "should this
 * person be on the racing page at all?"; profiles.status answers "is their
 * current name/image/bio approved for publication?". Both must pass.
 */

export const PERSONA_KEYS = [
  "member",
  "theteam",
  "coach",
  "alumni",
  "admin",
  "radfriends",
  "private",
] as const;

export type PersonaKey = (typeof PERSONA_KEYS)[number];

// Human-readable descriptions for each persona. Kept here as the canonical
// in-repo source; migrations also seed a description column for use at runtime
// in Cloudflare D1. Keep these in sync with DB seeds.
export const PERSONA_DESCRIPTIONS: Record<string, string> = {
  member: "A registered account; no public presence by default.",
  theteam: "Featured team members who appear on the racing/team pages.",
  coach: "Coaches who offer paid or free coaching services and appear on the services page.",
  alumni: "Former team members who are kept as alumni on the site.",
  admin: "Administrative accounts with the ability to grant and revoke personas and review content.",
  radfriends: "Friends of the project with lightweight public presence (rad friends).",
  private: "Private accounts used for internal or non-public purposes.",
};

/** Granted automatically on first login: an account, and no public presence. */
export const DEFAULT_PERSONA: PersonaKey = "member";

/** The persona that may grant and revoke other personas. */
const ADMIN_PERSONA: PersonaKey = "admin";

export async function getUserPersonas(
  db: D1Database,
  userId: number,
): Promise<PersonaKey[]> {
  const { results } = await db
    .prepare(
      "SELECT persona_key FROM user_personas WHERE user_id = ? ORDER BY persona_key",
    )
    .bind(userId)
    .all<{ persona_key: PersonaKey }>();

  return results.map((row) => row.persona_key);
}

export async function hasPersona(
  db: D1Database,
  userId: number,
  persona: PersonaKey,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS present FROM user_personas WHERE user_id = ? AND persona_key = ?",
    )
    .bind(userId, persona)
    .first<{ present: number }>();

  return row !== null;
}

/** Every user id holding a persona. Used to build the public listings. */
export async function listUsersWithPersona(
  db: D1Database,
  persona: PersonaKey,
): Promise<number[]> {
  const { results } = await db
    .prepare(
      "SELECT user_id FROM user_personas WHERE persona_key = ? ORDER BY user_id",
    )
    .bind(persona)
    .all<{ user_id: number }>();

  return results.map((row) => row.user_id);
}

/**
 * Grants the default persona. This is the system path used at first login, so
 * it takes no grantor and is restricted to the default persona — it can never
 * be used to hand out a public or administrative role.
 */
export async function grantDefaultPersona(
  db: D1Database,
  userId: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO user_personas (user_id, persona_key, granted_by) VALUES (?, ?, NULL)",
    )
    .bind(userId, DEFAULT_PERSONA)
    .run();
}

/**
 * Grants a persona on behalf of an admin.
 *
 * The grantor's admin status is checked here rather than only in the route so
 * that no caller can hand out a persona by skipping the HTTP layer. This is
 * also what stops a user granting themselves anything: their own id will not
 * hold the admin persona.
 */
export async function grantPersona(
  db: D1Database,
  {
    userId,
    persona,
    grantedBy,
  }: { userId: number; persona: PersonaKey; grantedBy: number },
): Promise<void> {
  if (!(await hasPersona(db, grantedBy, ADMIN_PERSONA))) {
    throw new Error(
      `user ${grantedBy} cannot grant personas: the admin persona is required`,
    );
  }

  await db
    .prepare(
      "INSERT OR IGNORE INTO user_personas (user_id, persona_key, granted_by) VALUES (?, ?, ?)",
    )
    .bind(userId, persona, grantedBy)
    .run();
}

export async function revokePersona(
  db: D1Database,
  userId: number,
  persona: PersonaKey,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM user_personas WHERE user_id = ? AND persona_key = ?",
    )
    .bind(userId, persona)
    .run();
}
