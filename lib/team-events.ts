import { AuthenticationError, requireAuthenticatedUser } from "./auth";
import { ensureOccurrencesGenerated } from "./session-occurrences";
import {
  isValidIsoDate,
  isValidSessionType,
  isValidTimeOfDay,
  SCHEDULABLE_RIDER_PERSONAS,
  SESSION_TYPE_LABELS,
  todayIso,
} from "./coaching-constraints";
import { hasPersona } from "./personas";
import { isSchedulableRider, requireCoachOrAdmin } from "./weekly-assignments";

export class TeamEventError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TeamEventError";
    this.status = status;
  }
}

export type TeamEventAttendee = { id: number; displayName: string | null };

export type TeamEvent = {
  id: number;
  coachId: number;
  coachDisplayName: string | null;
  eventDate: string;
  startTime: string;
  durationMinutes: number;
  /** Wall-clock finish: startTime + durationMinutes, HH:MM. */
  finishTime: string;
  locationUrl: string;
  /** Free-text notes: route, pace, what to bring. */
  info: string | null;
  /** theteam riders who have NOT opted out. */
  attendees: TeamEventAttendee[];
  /** Riders who marked themselves not available. */
  absentees: TeamEventAttendee[];
};

const MAX_TEAM_EVENT_MINUTES = 720;
const MAX_LOCATION_URL_CHARACTERS = 500;
const MAX_INFO_CHARACTERS = 2000;

function validateInfo(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new TeamEventError("info must be a string", 400);
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_INFO_CHARACTERS) {
    throw new TeamEventError("info is too long", 400);
  }
  return trimmed;
}

const MAPS_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

function validateLocationUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TeamEventError("a Google Maps link is required", 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_LOCATION_URL_CHARACTERS) {
    throw new TeamEventError("the Maps link is too long", 400);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new TeamEventError("the Maps link must be a valid URL", 400);
  }
  if (parsed.protocol !== "https:") {
    throw new TeamEventError("the Maps link must use https", 400);
  }
  const host = parsed.hostname.toLowerCase();
  if (!MAPS_HOSTS.has(host) && host !== "google.com" && !host.endsWith(".google.com")) {
    throw new TeamEventError(
      "the meetup link must be a Google Maps link",
      400,
    );
  }
  return trimmed;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTimeOfDay(minutes: number): string {
  const normalized = minutes % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const rest = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

type CreateTeamEventInput = {
  actorId: number;
  coachId: number;
  eventDate: string;
  startTime: string;
  finishTime: string;
  locationUrl: unknown;
  info?: unknown;
};

export async function createTeamEvent(
  db: D1Database,
  input: CreateTeamEventInput,
): Promise<TeamEvent> {
  const { actorId, coachId, eventDate, startTime, finishTime, locationUrl } =
    input;
  await requireCoachOrAdmin(db, actorId, coachId);

  if (!isValidIsoDate(eventDate)) {
    throw new TeamEventError("event_date must be YYYY-MM-DD", 400);
  }
  if (eventDate < todayIso()) {
    throw new TeamEventError("a team ride cannot be scheduled in the past", 400);
  }
  if (!isValidTimeOfDay(startTime) || !isValidTimeOfDay(finishTime)) {
    throw new TeamEventError("start and finish must be HH:MM", 400);
  }
  const durationMinutes = toMinutes(finishTime) - toMinutes(startTime);
  if (durationMinutes <= 0) {
    throw new TeamEventError("finish time must be after the start time", 400);
  }
  if (durationMinutes > MAX_TEAM_EVENT_MINUTES) {
    throw new TeamEventError("a team ride cannot exceed 12 hours", 400);
  }
  // Group Rides are team-wide events, not per-rider bookings, so a
  // coach's Intervals/Lesson booking rules never constrain them.
  const validatedLocation = validateLocationUrl(locationUrl);
  const validatedInfo = validateInfo(input.info);

  const row = await db
    .prepare(
      `INSERT INTO team_events
         (coach_id, event_date, start_time, duration_minutes, location_url, info, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      coachId,
      eventDate,
      startTime,
      durationMinutes,
      validatedLocation,
      validatedInfo,
      actorId,
    )
    .first<{ id: number }>();
  if (!row) throw new TeamEventError("failed to create the team ride", 500);

  const events = await listTeamEvents(db, { fromDate: eventDate, throughDate: eventDate });
  return events[0];
}

type TeamEventRow = {
  id: number;
  coach_id: number;
  coach_display_name: string | null;
  event_date: string;
  start_time: string;
  duration_minutes: number;
  location_url: string;
  info: string | null;
};

/** All team riders (theteam persona holders) with their display names. */
async function listTeamRiders(db: D1Database): Promise<TeamEventAttendee[]> {
  const placeholders = SCHEDULABLE_RIDER_PERSONAS.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT DISTINCT u.id, COALESCE(p.display_name, u.display_name) AS display_name
       FROM users u
       JOIN user_personas up ON up.user_id = u.id
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE up.persona_key IN (${placeholders})
       ORDER BY display_name, u.id`,
    )
    .bind(...SCHEDULABLE_RIDER_PERSONAS)
    .all<{ id: number; display_name: string | null }>();
  return results.map((row) => ({ id: row.id, displayName: row.display_name }));
}

export async function listTeamEvents(
  db: D1Database,
  options: { fromDate?: string; throughDate?: string } = {},
): Promise<TeamEvent[]> {
  const fromDate = options.fromDate ?? todayIso();
  const clauses = ["te.event_date >= ?"];
  const binds: string[] = [fromDate];
  if (options.throughDate) {
    clauses.push("te.event_date <= ?");
    binds.push(options.throughDate);
  }

  const { results: rows } = await db
    .prepare(
      `SELECT te.id, te.coach_id,
              COALESCE(cp.display_name, coach.display_name) AS coach_display_name,
              te.event_date, te.start_time, te.duration_minutes, te.location_url,
              te.info
       FROM team_events te
       JOIN users coach ON coach.id = te.coach_id
       LEFT JOIN profiles cp ON cp.user_id = coach.id
       WHERE ${clauses.join(" AND ")}
       ORDER BY te.event_date, te.start_time, te.id`,
    )
    .bind(...binds)
    .all<TeamEventRow>();

  if (rows.length === 0) return [];

  const riders = await listTeamRiders(db);
  const { results: absences } = await db
    .prepare(
      `SELECT tea.event_id, tea.user_id,
              COALESCE(p.display_name, u.display_name) AS display_name
       FROM team_event_absences tea
       JOIN users u ON u.id = tea.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE tea.event_id IN (${rows.map(() => "?").join(", ")})`,
    )
    .bind(...rows.map((row) => row.id))
    .all<{ event_id: number; user_id: number; display_name: string | null }>();

  return rows.map((row) => {
    const absentees = absences
      .filter((absence) => absence.event_id === row.id)
      .map((absence) => ({ id: absence.user_id, displayName: absence.display_name }));
    const absentIds = new Set(absentees.map((absentee) => absentee.id));
    return {
      id: row.id,
      coachId: row.coach_id,
      coachDisplayName: row.coach_display_name,
      eventDate: row.event_date,
      startTime: row.start_time,
      durationMinutes: row.duration_minutes,
      finishTime: toTimeOfDay(toMinutes(row.start_time) + row.duration_minutes),
      locationUrl: row.location_url,
      info: row.info,
      attendees: riders.filter((rider) => !absentIds.has(rider.id)),
      absentees,
    };
  });
}

export type NextRide = {
  label: string;
  eventDate: string;
  startTime: string;
};

/**
 * The viewer's next upcoming items across everything they can see: their own
 * scheduled occurrences plus team rides, earliest first. Used by the nav bar.
 */
export async function getNextRidesForUser(
  db: D1Database,
  userId: number,
  limit = 3,
): Promise<NextRide[]> {
  await ensureOccurrencesGenerated(db);

  const { results: occurrences } = await db
    .prepare(
      `SELECT so.occurrence_date, so.start_time, so.session_type
       FROM session_occurrences so
       WHERE so.rider_id = ? AND so.status = 'scheduled'
         AND so.occurrence_date >= date('now')
       ORDER BY so.occurrence_date, so.start_time
       LIMIT ?`,
    )
    .bind(userId, limit)
    .all<{ occurrence_date: string; start_time: string; session_type: string }>();

  const { results: teamEvents } = await db
    .prepare(
      `SELECT event_date, start_time FROM team_events
       WHERE event_date >= date('now')
       ORDER BY event_date, start_time
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ event_date: string; start_time: string }>();

  const candidates: NextRide[] = [
    ...occurrences.map((occurrence) => ({
      label: isValidSessionType(occurrence.session_type)
        ? SESSION_TYPE_LABELS[occurrence.session_type]
        : occurrence.session_type,
      eventDate: occurrence.occurrence_date,
      startTime: occurrence.start_time,
    })),
    ...teamEvents.map((teamEvent) => ({
      label: SESSION_TYPE_LABELS.practiceride as string,
      eventDate: teamEvent.event_date,
      startTime: teamEvent.start_time,
    })),
  ];

  candidates.sort((a, b) =>
    `${a.eventDate}T${a.startTime}`.localeCompare(`${b.eventDate}T${b.startTime}`),
  );
  return candidates.slice(0, limit);
}

export async function getNextRideForUser(
  db: D1Database,
  userId: number,
): Promise<NextRide | null> {
  return (await getNextRidesForUser(db, userId, 1))[0] ?? null;
}

/** HTTP behavior for GET /api/me/next-ride. */
export async function handleGetNextRide(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    const coach = await hasPersona(db, userId, "coach");
    return Response.json(
      {
        rides: await getNextRidesForUser(db, userId),
        // Where the nav link should land: coaches manage their calendar on
        // /coach; riders see theirs on their profile.
        href: coach ? "/coach" : "/profile#sessions-calendar",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }
}

export async function deleteTeamEvent(
  db: D1Database,
  actorId: number,
  coachId: number,
  eventId: number,
): Promise<void> {
  await requireCoachOrAdmin(db, actorId, coachId);
  const result = await db
    .prepare("DELETE FROM team_events WHERE id = ? AND coach_id = ?")
    .bind(eventId, coachId)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new TeamEventError("team ride not found", 404);
  }
}

/**
 * A theteam rider marks themselves (un)available for a team ride. Everyone
 * is attending by default; an absence row is the opt-out.
 */
export async function setTeamEventAbsence(
  db: D1Database,
  userId: number,
  eventId: number,
  unavailable: boolean,
): Promise<void> {
  if (!(await isSchedulableRider(db, userId))) {
    throw new TeamEventError("only team riders can RSVP to a team ride", 403);
  }

  const event = await db
    .prepare("SELECT id FROM team_events WHERE id = ? AND event_date >= date('now')")
    .bind(eventId)
    .first();
  if (!event) throw new TeamEventError("team ride not found", 404);

  if (unavailable) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO team_event_absences (event_id, user_id) VALUES (?, ?)",
      )
      .bind(eventId, userId)
      .run();
  } else {
    await db
      .prepare("DELETE FROM team_event_absences WHERE event_id = ? AND user_id = ?")
      .bind(eventId, userId)
      .run();
  }
}
