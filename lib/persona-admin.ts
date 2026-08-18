import {
  PERSONA_KEYS,
  type PersonaKey,
  grantPersona,
  hasPersona,
  revokePersona,
} from "./personas";
import { resolveSessionFromRequest } from "./session";

/**
 * A persona change that was refused. Carries an HTTP status so route handlers
 * can translate it without re-deriving why the change was rejected.
 */
export class PersonaChangeError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PersonaChangeError";
    this.status = status;
  }
}

/**
 * Resolves the caller and confirms they hold `admin`, or throws.
 *
 * 401 and 403 are kept distinct on purpose: "you are not signed in" and "you
 * are signed in but not an admin" are different problems, and collapsing them
 * makes the admin screen impossible to debug.
 */
export async function requireAdminUser(
  db: D1Database,
  request: Request,
): Promise<number> {
  const session = await resolveSessionFromRequest(db, request);

  if (!session) {
    throw new PersonaChangeError("authentication required", 401);
  }

  if (!(await hasPersona(db, session.userId, "admin"))) {
    throw new PersonaChangeError("the admin persona is required", 403);
  }

  return session.userId;
}

export type PersonaChange = {
  /** The signed-in user attempting the change. Must hold `admin`. */
  actorId: number;
  /** The account being changed. */
  userId: number;
  persona: PersonaKey;
  action: "grant" | "revoke";
  /** Purges public reads after a public persona changes visibility. */
  onPublicVisibilityChanged?: (userId: number) => Promise<void>;
};

const PUBLIC_PERSONAS: ReadonlySet<PersonaKey> = new Set([
  "theteam",
  "coach",
  "alumni",
]);

function isKnownPersona(persona: string): persona is PersonaKey {
  return (PERSONA_KEYS as readonly string[]).includes(persona);
}

async function countAdmins(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM user_personas WHERE persona_key = 'admin'",
    )
    .first<{ n: number }>();

  return row?.n ?? 0;
}

/** Whether the one-time first-admin bootstrap has already been completed. */
export async function hasAnyAdmin(db: D1Database): Promise<boolean> {
  return (await countAdmins(db)) > 0;
}

export type AdminDashboardStats = {
  users: number;
  pendingProfiles: number;
  publishedProfiles: number;
};

/** Small admin-only totals for the dashboard; no account details leave D1. */
export async function getAdminDashboardStats(
  db: D1Database,
  actorId: number,
): Promise<AdminDashboardStats> {
  if (!(await hasPersona(db, actorId, "admin"))) {
    throw new PersonaChangeError(
      "the admin persona is required to view the dashboard",
      403,
    );
  }

  const [users, pendingProfiles, publishedProfiles] = await db.batch<{
    total: number;
  }>([
    db.prepare("SELECT COUNT(*) AS total FROM users"),
    db.prepare(
      "SELECT COUNT(*) AS total FROM profiles WHERE status = 'pending'",
    ),
    db.prepare("SELECT COUNT(*) AS total FROM published_profiles"),
  ]);

  return {
    users: users.results[0]?.total ?? 0,
    pendingProfiles: pendingProfiles.results[0]?.total ?? 0,
    publishedProfiles: publishedProfiles.results[0]?.total ?? 0,
  };
}

/**
 * Grants or revokes a persona on behalf of an admin.
 *
 * Two refusals matter here. The caller must hold `admin`, checked against the
 * database rather than anything the client sent. And the final `admin` grant
 * cannot be removed — without that guard an admin can lock the site out of its
 * own review queue, with no way back in short of hand-editing D1.
 */
export async function applyPersonaChange(
  db: D1Database,
  {
    actorId,
    userId,
    persona,
    action,
    onPublicVisibilityChanged,
  }: PersonaChange,
): Promise<void> {
  if (!isKnownPersona(persona)) {
    throw new PersonaChangeError(`unknown persona: ${persona}`, 400);
  }

  if (!(await hasPersona(db, actorId, "admin"))) {
    throw new PersonaChangeError(
      "the admin persona is required to change personas",
      403,
    );
  }

  if (action === "revoke") {
    if (persona === "admin" && (await countAdmins(db)) <= 1) {
      throw new PersonaChangeError(
        "cannot revoke the last remaining admin persona",
        409,
      );
    }

    await revokePersona(db, userId, persona);
    if (PUBLIC_PERSONAS.has(persona)) {
      await onPublicVisibilityChanged?.(userId);
    }
    return;
  }

  await grantPersona(db, { userId, persona, grantedBy: actorId });
  if (PUBLIC_PERSONAS.has(persona)) {
    await onPublicVisibilityChanged?.(userId);
  }
}

export type UserWithPersonas = {
  id: number;
  email: string | null;
  displayName: string | null;
  personas: PersonaKey[];
};

/**
 * Every account and the personas it holds, for the admin management screen.
 * google_sub is deliberately not selected: it is an identity secret with no
 * business being rendered in a UI.
 */
export async function listUsersWithPersonas(
  db: D1Database,
): Promise<UserWithPersonas[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.email, u.display_name, up.persona_key
       FROM users u
       LEFT JOIN user_personas up ON up.user_id = u.id
       ORDER BY u.id, up.persona_key`,
    )
    .all<{
      id: number;
      email: string | null;
      display_name: string | null;
      persona_key: PersonaKey | null;
    }>();

  const byId = new Map<number, UserWithPersonas>();

  for (const row of results) {
    let user = byId.get(row.id);

    if (!user) {
      user = {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        personas: [],
      };
      byId.set(row.id, user);
    }

    if (row.persona_key) user.personas.push(row.persona_key);
  }

  return [...byId.values()];
}
