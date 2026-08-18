import { cookies } from "next/headers";
import { findCurrentUser, type CurrentUser } from "./auth";
import { getDb } from "./db";
import { SESSION_COOKIE_NAME, resolveSession } from "./session";

export type { CurrentUser } from "./auth";

/**
 * The signed-in user for server-rendered pages, or null.
 *
 * Reads the session cookie directly, which is why the session cookie uses
 * Path=/ — navigation has to know who you are while the page renders, not
 * after a client-side round trip.
 *
 * Calling this makes a route dynamic. That is intended for the shared layout;
 * be deliberate before adding it anywhere else.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const db = await getDb();
  const session = await resolveSession(db, token);
  if (!session) return null;

  // The session outlived its user — treat as signed out rather than crashing.
  return (await findCurrentUser(db, session.userId)) satisfies CurrentUser | null;
}
