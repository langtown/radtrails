import { AuthenticationError, requireAuthenticatedUser } from "./auth";
import { PersonaChangeError, requireAdminUser } from "./persona-admin";

export class PlaylistError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PlaylistError";
    this.status = status;
  }
}

const MAX_PLAYLIST_URL_CHARACTERS = 300;
const PRIVATE_NO_STORE = "private, no-store";

export type Playlist = { playlistUrl: string | null };

export async function getPlaylist(
  db: D1Database,
  userId: number,
): Promise<Playlist> {
  const row = await db
    .prepare("SELECT playlist_url FROM athlete_playlists WHERE user_id = ?")
    .bind(userId)
    .first<{ playlist_url: string | null }>();

  return { playlistUrl: row?.playlist_url ?? null };
}

function validatePlaylistUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new PlaylistError("playlist_url must be a string or null", 400);
  }

  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_PLAYLIST_URL_CHARACTERS) {
    throw new PlaylistError("playlist_url is too long", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PlaylistError("playlist_url must be a valid URL", 400);
  }
  if (parsed.protocol !== "https:") {
    throw new PlaylistError("playlist_url must use https", 400);
  }

  return trimmed;
}

export async function setPlaylist(
  db: D1Database,
  userId: number,
  playlistUrl: unknown,
): Promise<Playlist> {
  const validated = validatePlaylistUrl(playlistUrl);

  await db
    .prepare(
      `INSERT INTO athlete_playlists (user_id, playlist_url) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         playlist_url = excluded.playlist_url, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userId, validated)
    .run();

  return { playlistUrl: validated };
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

function errorResponse(error: unknown): Response | null {
  if (
    error instanceof AuthenticationError ||
    error instanceof PlaylistError ||
    error instanceof PersonaChangeError
  ) {
    return privateJson({ error: error.message }, error.status);
  }
  return null;
}

/** HTTP behavior for GET /api/me/playlist. */
export async function handleGetPlaylist(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    return privateJson(await getPlaylist(db, userId));
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** HTTP behavior for GET /api/admin/users/[id]/playlist: admin reads a rider's playlist. */
export async function handleAdminGetPlaylist(
  db: D1Database,
  request: Request,
  userId: number,
): Promise<Response> {
  try {
    await requireAdminUser(db, request);
    return privateJson(await getPlaylist(db, userId));
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** HTTP behavior for PUT /api/admin/users/[id]/playlist: admin sets a rider's playlist. */
export async function handleAdminPutPlaylist(
  db: D1Database,
  request: Request,
  userId: number,
): Promise<Response> {
  try {
    await requireAdminUser(db, request);

    let body: { playlistUrl?: unknown };
    try {
      body = (await request.json()) as { playlistUrl?: unknown };
    } catch {
      throw new PlaylistError("request body must be valid JSON", 400);
    }

    return privateJson(await setPlaylist(db, userId, body.playlistUrl ?? null));
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** HTTP behavior for PUT /api/me/playlist. */
export async function handlePutPlaylist(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);

    let body: { playlistUrl?: unknown };
    try {
      body = (await request.json()) as { playlistUrl?: unknown };
    } catch {
      throw new PlaylistError("request body must be valid JSON", 400);
    }

    return privateJson(await setPlaylist(db, userId, body.playlistUrl ?? null));
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}
