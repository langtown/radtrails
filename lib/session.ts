/** How long a new session stays valid. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export const SESSION_COOKIE_NAME = "rad_session";

/**
 * Path=/ rather than a narrower /api: the site is server-rendered by the same
 * Worker, so navigation has to know whether the visitor is signed in while
 * rendering the page itself, not only when it later calls /api/me.
 */
const SESSION_COOKIE_PATH = "/";

function cookieAttributes(secure: boolean): string[] {
  const attributes = [
    `Path=${SESSION_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  // Browsers reject Secure cookies over plain http, which would silently break
  // sign-in on http://localhost during development.
  if (secure) attributes.push("Secure");

  return attributes;
}

export function buildSessionCookie({
  token,
  expiresAt,
  secure = true,
}: {
  token: string;
  expiresAt: Date;
  secure?: boolean;
}): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    ...cookieAttributes(secure),
    `Expires=${expiresAt.toUTCString()}`,
  ].join("; ");
}

/** Set-Cookie value that removes the session cookie. Used on logout. */
export function buildClearedSessionCookie({
  secure = true,
}: { secure?: boolean } = {}): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    ...cookieAttributes(secure),
    "Max-Age=0",
  ].join("; ");
}

/**
 * Generates an opaque session token: 32 bytes of CSPRNG output, base64url
 * encoded. Web Crypto only — this has to run on workerd.
 */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** SHA-256 of a token, lowercase hex. This is the only form we persist. */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Pulls the session token out of a request's Cookie header, or null if absent.
 * Names are matched exactly so a cookie like `evil_rad_session` cannot pass
 * itself off as the real one.
 */
export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;

    if (pair.slice(0, separator).trim() === SESSION_COOKIE_NAME) {
      return pair.slice(separator + 1).trim();
    }
  }

  return null;
}

export type NewSession = {
  /** The raw token. Goes to the browser, never to the database. */
  token: string;
  expiresAt: Date;
};

export async function createSession(
  db: D1Database,
  userId: number,
): Promise<NewSession> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db
    .prepare(
      "INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)",
    )
    .bind(await hashToken(token), userId, expiresAt.toISOString())
    .run();

  return { token, expiresAt };
}

export type ResolvedSession = {
  userId: number;
  expiresAt: Date;
};

/**
 * Looks up the session a token belongs to, or null if the token is unknown or
 * expired. Expiry is filtered in SQL so a stale row can never resolve, even if
 * the sweeper has not run.
 */
export async function resolveSession(
  db: D1Database,
  token: string,
): Promise<ResolvedSession | null> {
  const row = await db
    .prepare(
      "SELECT user_id, expires_at FROM sessions WHERE id_hash = ? AND expires_at > ?",
    )
    .bind(await hashToken(token), new Date().toISOString())
    .first<{ user_id: number; expires_at: string }>();

  if (!row) return null;

  return { userId: row.user_id, expiresAt: new Date(row.expires_at) };
}

/** Convenience wrapper: cookie header in, resolved session out. */
export async function resolveSessionFromRequest(
  db: D1Database,
  request: Request,
): Promise<ResolvedSession | null> {
  const token = readSessionToken(request);
  if (!token) return null;

  return resolveSession(db, token);
}

/** Invalidates a single session. Used on logout. */
export async function deleteSession(
  db: D1Database,
  token: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE id_hash = ?")
    .bind(await hashToken(token))
    .run();
}

/**
 * Exchanges a valid token for a fresh one, invalidating the old session.
 * Returns null if the token was unknown or expired, so a stale cookie can
 * never be traded up into a live session.
 */
export async function rotateSession(
  db: D1Database,
  token: string,
): Promise<NewSession | null> {
  const existing = await resolveSession(db, token);
  if (!existing) return null;

  await deleteSession(db, token);
  return createSession(db, existing.userId);
}

/**
 * Sweeps expired rows and returns how many were removed. Expired sessions
 * already fail to resolve; this just stops the table growing without bound.
 */
export async function deleteExpiredSessions(db: D1Database): Promise<number> {
  const { meta } = await db
    .prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .bind(new Date().toISOString())
    .run();

  return meta.changes ?? 0;
}
