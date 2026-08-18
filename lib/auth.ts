import { getUserPersonas, type PersonaKey } from "./personas";
import {
  buildClearedSessionCookie,
  deleteSession,
  readSessionToken,
  resolveSessionFromRequest,
} from "./session";

const PRIVATE_NO_STORE = "private, no-store";

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message = "authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * The account attached to a server-validated session.
 *
 * `id` stays server-side. API responses deliberately project this type down to
 * display fields so clients never need to send an identity back to us.
 */
export type CurrentUser = {
  id: number;
  email: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  personas: PersonaKey[];
};

/** Loads one account after its internal id has been resolved server-side. */
export async function findCurrentUser(
  db: D1Database,
  userId: number,
): Promise<CurrentUser | null> {
  const row = await db
    .prepare(
      "SELECT id, email, display_name, picture_url FROM users WHERE id = ?",
    )
    .bind(userId)
    .first<{
      id: number;
      email: string | null;
      display_name: string | null;
      picture_url: string | null;
    }>();

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    pictureUrl: row.picture_url,
    personas: await getUserPersonas(db, userId),
  };
}

/**
 * Resolves the opaque session cookie to the only identity route handlers may
 * trust. Request bodies and caller-supplied identity headers are never read.
 */
export async function requireAuthenticatedUser(
  db: D1Database,
  request: Request,
): Promise<number> {
  const session = await resolveSessionFromRequest(db, request);
  if (!session) throw new AuthenticationError();

  return session.userId;
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

/** HTTP behavior for GET /api/me, separated from Next.js binding lookup. */
export async function handleGetMe(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    const user = await findCurrentUser(db, userId);
    if (!user) throw new AuthenticationError();

    return privateJson({
      email: user.email,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
      personas: user.personas,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return privateJson({ error: error.message }, error.status);
    }
    throw error;
  }
}

/** HTTP behavior for POST /api/auth/logout, separated for real-D1 tests. */
export async function handleLogout(
  db: D1Database,
  request: Request,
): Promise<Response> {
  const token = readSessionToken(request);

  if (token) {
    // Clear only the session that was presented. Other devices stay signed in.
    await deleteSession(db, token);
  }

  const headers = new Headers({
    "Cache-Control": PRIVATE_NO_STORE,
    Location: "/",
  });
  headers.set(
    "Set-Cookie",
    buildClearedSessionCookie({
      secure: new URL(request.url).protocol === "https:",
    }),
  );

  return new Response(null, { status: 303, headers });
}
