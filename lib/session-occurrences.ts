import { AuthenticationError, requireAuthenticatedUser } from "./auth";
import {
  MAX_RIDERS_PER_SLOT,
  OCCURRENCE_WINDOW_WEEKS,
  isValidIsoDate,
  isValidTimeOfDay,
  type SessionType,
} from "./coaching-constraints";
import { requireCoachOrAdmin } from "./weekly-assignments";

export class ScheduleOccurrenceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ScheduleOccurrenceError";
    this.status = status;
  }
}

export type SessionOccurrence = {
  id: number;
  weeklyAssignmentId: number;
  coachId: number;
  riderId: number;
  riderDisplayName: string | null;
  riderPlaylistUrl: string | null;
  sessionType: SessionType;
  occurrenceDate: string;
  startTime: string;
  durationMinutes: number;
  status: "scheduled" | "cancelled";
  notes: string | null;
};

type OccurrenceRow = {
  id: number;
  weekly_assignment_id: number;
  coach_id: number;
  rider_id: number;
  rider_display_name: string | null;
  playlist_url: string | null;
  session_type: string;
  occurrence_date: string;
  start_time: string;
  duration_minutes: number;
  status: "scheduled" | "cancelled";
  notes: string | null;
};

function rowToOccurrence(row: OccurrenceRow): SessionOccurrence {
  return {
    id: row.id,
    weeklyAssignmentId: row.weekly_assignment_id,
    coachId: row.coach_id,
    riderId: row.rider_id,
    riderDisplayName: row.rider_display_name,
    riderPlaylistUrl: row.playlist_url,
    sessionType: row.session_type as SessionType,
    occurrenceDate: row.occurrence_date,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    status: row.status,
    notes: row.notes,
  };
}

const OCCURRENCE_SELECT = `
  SELECT so.id, so.weekly_assignment_id, so.coach_id, so.rider_id,
         u.display_name AS rider_display_name, ap.playlist_url,
         so.session_type, so.occurrence_date, so.start_time,
         so.duration_minutes, so.status, so.notes
  FROM session_occurrences so
  JOIN users u ON u.id = so.rider_id
  LEFT JOIN athlete_playlists ap ON ap.user_id = so.rider_id
`;

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ensures dated occurrences exist for every active weekly assignment from
 * today through `throughDate` (inclusive). Safe to call on every schedule
 * read: `INSERT ... WHERE NOT EXISTS` leaves already-generated dates alone.
 */
export async function ensureOccurrencesGenerated(
  db: D1Database,
  throughDate: string = addDaysIso(todayIso(), OCCURRENCE_WINDOW_WEEKS * 7),
): Promise<void> {
  const { results: assignments } = await db
    .prepare(
      `SELECT id, coach_id, rider_id, session_type, day_of_week, start_time, duration_minutes
       FROM weekly_assignments WHERE active = 1`,
    )
    .all<{
      id: number;
      coach_id: number;
      rider_id: number;
      session_type: string;
      day_of_week: number;
      start_time: string;
      duration_minutes: number;
    }>();

  if (assignments.length === 0) return;

  const start = todayIso();
  const statements: D1PreparedStatement[] = [];

  for (const assignment of assignments) {
    const cursorDay = new Date(`${start}T00:00:00Z`).getUTCDay();
    const daysUntil = (assignment.day_of_week - cursorDay + 7) % 7;
    let cursor = addDaysIso(start, daysUntil);

    while (cursor <= throughDate) {
      statements.push(
        db
          .prepare(
            `INSERT INTO session_occurrences
               (weekly_assignment_id, coach_id, rider_id, session_type,
                occurrence_date, start_time, duration_minutes)
             SELECT ?, ?, ?, ?, ?, ?, ?
             WHERE NOT EXISTS (
               SELECT 1 FROM session_occurrences
               WHERE weekly_assignment_id = ? AND occurrence_date = ?
             )`,
          )
          .bind(
            assignment.id,
            assignment.coach_id,
            assignment.rider_id,
            assignment.session_type,
            cursor,
            assignment.start_time,
            assignment.duration_minutes,
            assignment.id,
            cursor,
          ),
      );
      cursor = addDaysIso(cursor, 7);
    }
  }

  if (statements.length > 0) await db.batch(statements);
}

export async function listOccurrencesForCoach(
  db: D1Database,
  actorId: number,
  coachId: number,
): Promise<SessionOccurrence[]> {
  await requireCoachOrAdmin(db, actorId, coachId);
  await ensureOccurrencesGenerated(db);

  const { results } = await db
    .prepare(
      `${OCCURRENCE_SELECT}
       WHERE so.coach_id = ? AND so.occurrence_date >= date('now')
       ORDER BY so.occurrence_date, so.start_time, so.id`,
    )
    .bind(coachId)
    .all<OccurrenceRow>();

  return results.map(rowToOccurrence);
}

export async function listOccurrencesForRider(
  db: D1Database,
  riderId: number,
): Promise<SessionOccurrence[]> {
  await ensureOccurrencesGenerated(db);

  const { results } = await db
    .prepare(
      `${OCCURRENCE_SELECT}
       WHERE so.rider_id = ? AND so.occurrence_date >= date('now')
       ORDER BY so.occurrence_date, so.start_time, so.id`,
    )
    .bind(riderId)
    .all<OccurrenceRow>();

  return results.map(rowToOccurrence);
}

type RescheduleOccurrenceInput = {
  actorId: number;
  coachId: number;
  occurrenceId: number;
  occurrenceDate: string;
  startTime: string;
};

export async function rescheduleOccurrence(
  db: D1Database,
  input: RescheduleOccurrenceInput,
): Promise<SessionOccurrence> {
  const { actorId, coachId, occurrenceId, occurrenceDate, startTime } = input;
  await requireCoachOrAdmin(db, actorId, coachId);

  if (!isValidIsoDate(occurrenceDate)) {
    throw new ScheduleOccurrenceError(
      "occurrence_date must be YYYY-MM-DD",
      400,
    );
  }
  if (!isValidTimeOfDay(startTime)) {
    throw new ScheduleOccurrenceError("start_time must be HH:MM", 400);
  }

  const existing = await db
    .prepare(
      `SELECT id, weekly_assignment_id, rider_id, session_type, duration_minutes
       FROM session_occurrences
       WHERE id = ? AND coach_id = ? AND status = 'scheduled'`,
    )
    .bind(occurrenceId, coachId)
    .first<{
      id: number;
      weekly_assignment_id: number;
      rider_id: number;
      session_type: string;
      duration_minutes: number;
    }>();

  if (!existing) {
    throw new ScheduleOccurrenceError("occurrence not found", 404);
  }

  const collision = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM session_occurrences
       WHERE coach_id = ? AND session_type = ? AND occurrence_date = ?
         AND start_time = ? AND status = 'scheduled' AND id != ?`,
    )
    .bind(coachId, existing.session_type, occurrenceDate, startTime, occurrenceId)
    .first<{ n: number }>();

  if ((collision?.n ?? 0) >= MAX_RIDERS_PER_SLOT) {
    throw new ScheduleOccurrenceError(
      "that date and time already has two riders scheduled",
      409,
    );
  }

  await db
    .prepare(
      `UPDATE session_occurrences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(occurrenceId)
    .run();

  const upserted = await db
    .prepare(
      `INSERT INTO session_occurrences
         (weekly_assignment_id, coach_id, rider_id, session_type,
          occurrence_date, start_time, duration_minutes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')
       ON CONFLICT (weekly_assignment_id, occurrence_date) DO UPDATE SET
         start_time = excluded.start_time,
         duration_minutes = excluded.duration_minutes,
         status = 'scheduled',
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
    )
    .bind(
      existing.weekly_assignment_id,
      coachId,
      existing.rider_id,
      existing.session_type,
      occurrenceDate,
      startTime,
      existing.duration_minutes,
    )
    .first<{ id: number }>();

  const updated = await db
    .prepare(`${OCCURRENCE_SELECT} WHERE so.id = ?`)
    .bind(upserted!.id)
    .first<OccurrenceRow>();

  return rowToOccurrence(updated!);
}

export async function cancelOccurrence(
  db: D1Database,
  actorId: number,
  coachId: number,
  occurrenceId: number,
): Promise<void> {
  await requireCoachOrAdmin(db, actorId, coachId);

  const result = await db
    .prepare(
      `UPDATE session_occurrences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND coach_id = ? AND status = 'scheduled'`,
    )
    .bind(occurrenceId, coachId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new ScheduleOccurrenceError("occurrence not found", 404);
  }
}

const PRIVATE_NO_STORE = "private, no-store";

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

/** HTTP behavior for GET /api/me/sessions. */
export async function handleGetMySessions(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    return privateJson({ sessions: await listOccurrencesForRider(db, userId) });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return privateJson({ error: error.message }, error.status);
    }
    throw error;
  }
}
