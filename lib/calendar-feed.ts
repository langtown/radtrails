import { AuthenticationError, requireAuthenticatedUser } from "./auth";
import {
  SESSION_TYPE_LABELS,
  isValidSessionType,
} from "./coaching-constraints";
import { buildICalendar, type IcsEvent } from "./ics";
import { ensureOccurrencesGenerated } from "./session-occurrences";
import { listTeamEvents } from "./team-events";

export class CalendarFeedError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CalendarFeedError";
    this.status = status;
  }
}

const CALENDAR_NAME = "Radtrails Intervals";
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Returns the user's feed token, creating it on first use. INSERT OR IGNORE +
 * SELECT keeps concurrent first requests on the same token.
 */
export async function getOrCreateFeedToken(
  db: D1Database,
  userId: number,
): Promise<string> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO calendar_feed_tokens (user_id, token) VALUES (?, ?)",
    )
    .bind(userId, generateToken())
    .run();
  const row = await db
    .prepare("SELECT token FROM calendar_feed_tokens WHERE user_id = ?")
    .bind(userId)
    .first<{ token: string }>();
  if (!row) throw new CalendarFeedError("failed to create feed token", 500);
  return row.token;
}

/** Replaces the user's token; every previously shared feed URL stops working. */
export async function rotateFeedToken(
  db: D1Database,
  userId: number,
): Promise<string> {
  const token = generateToken();
  await db
    .prepare(
      `INSERT INTO calendar_feed_tokens (user_id, token, rotated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         token = excluded.token,
         rotated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userId, token)
    .run();
  return token;
}

type FeedOccurrenceRow = {
  id: number;
  coach_id: number;
  rider_id: number;
  coach_display_name: string | null;
  rider_display_name: string | null;
  playlist_url: string | null;
  session_type: string;
  occurrence_date: string;
  start_time: string;
  duration_minutes: number;
  status: "scheduled" | "cancelled";
  notes: string | null;
};

/**
 * Builds the iCal feed for the user behind `token`: every future occurrence
 * they ride or coach, including cancellations so subscribed calendars remove
 * them. The token is the feed URL's only credential, so a malformed or
 * unknown token gets the same 404 — there is nothing to enumerate.
 */
export async function buildFeedForToken(
  db: D1Database,
  token: string,
): Promise<string> {
  if (!TOKEN_PATTERN.test(token)) {
    throw new CalendarFeedError("calendar feed not found", 404);
  }
  const owner = await db
    .prepare("SELECT user_id FROM calendar_feed_tokens WHERE token = ?")
    .bind(token)
    .first<{ user_id: number }>();
  if (!owner) throw new CalendarFeedError("calendar feed not found", 404);

  await ensureOccurrencesGenerated(db);

  const { results } = await db
    .prepare(
      `SELECT so.id, so.coach_id, so.rider_id,
              COALESCE(coach_profile.display_name, coach.display_name) AS coach_display_name,
              COALESCE(rider_profile.display_name, rider.display_name) AS rider_display_name,
              ap.playlist_url,
              so.session_type, so.occurrence_date, so.start_time,
              so.duration_minutes, so.status, so.notes
       FROM session_occurrences so
       JOIN users coach ON coach.id = so.coach_id
       LEFT JOIN profiles coach_profile ON coach_profile.user_id = coach.id
       JOIN users rider ON rider.id = so.rider_id
       LEFT JOIN profiles rider_profile ON rider_profile.user_id = rider.id
       LEFT JOIN athlete_playlists ap ON ap.user_id = so.rider_id
       WHERE (so.rider_id = ? OR so.coach_id = ?)
         AND so.occurrence_date >= date('now')
       ORDER BY so.occurrence_date, so.start_time, so.id`,
    )
    .bind(owner.user_id, owner.user_id)
    .all<FeedOccurrenceRow>();

  const teamEvents = await listTeamEvents(db);
  const ownerPersonas = await db
    .prepare(
      `SELECT persona_key FROM user_personas
       WHERE user_id = ? AND persona_key IN ('theteam', 'coach')`,
    )
    .bind(owner.user_id)
    .all<{ persona_key: string }>();
  const ownerIsTeamMember = ownerPersonas.results.some(
    (row) => row.persona_key === "theteam" || row.persona_key === "coach",
  );

  const events: IcsEvent[] = results.map((row) => {
    const riderName = row.rider_display_name ?? "rider";
    const label = isValidSessionType(row.session_type)
      ? SESSION_TYPE_LABELS[row.session_type]
      : row.session_type;
    const summary =
      row.rider_id === owner.user_id
        ? `${label} with Coach ${row.coach_display_name ?? ""}`.trimEnd()
        : `${label} with ${riderName}`;
    const description = [
      row.notes,
      row.playlist_url ? `Playlist: ${row.playlist_url}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      uid: `session-occurrence-${row.id}@radtrails.org`,
      summary,
      description: description || null,
      date: row.occurrence_date,
      startTime: row.start_time,
      durationMinutes: row.duration_minutes,
      cancelled: row.status === "cancelled",
    };
  });

  // Team rides are one shared event for the coach and every team rider.
  if (ownerIsTeamMember) {
    for (const teamEvent of teamEvents) {
      events.push({
        uid: `team-event-${teamEvent.id}@radtrails.org`,
        summary: SESSION_TYPE_LABELS.practiceride,
        description: [
          teamEvent.info,
          `Meetup: ${teamEvent.locationUrl}`,
          `Attending (${teamEvent.attendees.length}): ${teamEvent.attendees
            .map((attendee) => attendee.displayName ?? "rider")
            .join(", ")}`,
        ]
          .filter(Boolean)
          .join("\n"),
        date: teamEvent.eventDate,
        startTime: teamEvent.startTime,
        durationMinutes: teamEvent.durationMinutes,
      });
    }
  }

  return buildICalendar(events, CALENDAR_NAME);
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

function feedResponse(ics: string): Response {
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // The URL is a credential and schedules change: never let the edge
      // serve a stale feed or one minted before a token rotation.
      "Cache-Control": "private, no-cache",
    },
  });
}

/** HTTP behavior for GET /api/calendar/[token]. */
export async function handleGetCalendarFeed(
  db: D1Database,
  token: string,
): Promise<Response> {
  try {
    return feedResponse(await buildFeedForToken(db, token));
  } catch (error) {
    if (error instanceof CalendarFeedError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: NO_STORE },
      );
    }
    throw error;
  }
}

function feedUrl(request: Request, token: string): string {
  return `${new URL(request.url).origin}/api/calendar/${token}`;
}

function privateCalendarJson(
  request: Request,
  token: string,
  status = 200,
): Response {
  return Response.json(
    { feedUrl: feedUrl(request, token) },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

/** HTTP behavior for GET /api/me/calendar: the caller's own feed URL. */
export async function handleGetMyCalendar(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    return privateCalendarJson(request, await getOrCreateFeedToken(db, userId));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: NO_STORE },
      );
    }
    throw error;
  }
}

/** HTTP behavior for POST /api/me/calendar: rotate the caller's feed token. */
export async function handleRotateMyCalendar(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    return privateCalendarJson(request, await rotateFeedToken(db, userId));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: NO_STORE },
      );
    }
    throw error;
  }
}
