import { AuthenticationError, requireAuthenticatedUser } from "./auth";
import { assertBookable } from "./booking-windows";
import { PersonaChangeError, requireAdminUser } from "./persona-admin";
import {
  MAX_RIDERS_PER_SLOT,
  OCCURRENCE_WINDOW_WEEKS,
  isValidIsoDate,
  isValidTimeOfDay,
  todayIso,
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
  coachDisplayName: string | null;
  riderDisplayName: string | null;
  riderPlaylistUrl: string | null;
  sessionType: SessionType;
  occurrenceDate: string;
  startTime: string;
  durationMinutes: number;
  status: "scheduled" | "cancelled";
  /** The rider's RSVP while still scheduled: null means confirmed/attending. */
  riderResponse: "unsure" | null;
  notes: string | null;
};

type OccurrenceRow = {
  id: number;
  weekly_assignment_id: number;
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
  rider_response: "unsure" | null;
  notes: string | null;
};

function rowToOccurrence(row: OccurrenceRow): SessionOccurrence {
  return {
    id: row.id,
    weeklyAssignmentId: row.weekly_assignment_id,
    coachId: row.coach_id,
    riderId: row.rider_id,
    coachDisplayName: row.coach_display_name,
    riderDisplayName: row.rider_display_name,
    riderPlaylistUrl: row.playlist_url,
    sessionType: row.session_type as SessionType,
    occurrenceDate: row.occurrence_date,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    status: row.status,
    riderResponse: row.rider_response,
    notes: row.notes,
  };
}

const OCCURRENCE_SELECT = `
  SELECT so.id, so.weekly_assignment_id, so.coach_id, so.rider_id,
         COALESCE(coach_profile.display_name, coach.display_name) AS coach_display_name,
         COALESCE(rider_profile.display_name, u.display_name) AS rider_display_name,
         ap.playlist_url,
         so.session_type, so.occurrence_date, so.start_time,
         so.duration_minutes, so.status, so.rider_response, so.notes
  FROM session_occurrences so
  JOIN users u ON u.id = so.rider_id
  LEFT JOIN profiles rider_profile ON rider_profile.user_id = u.id
  JOIN users coach ON coach.id = so.coach_id
  LEFT JOIN profiles coach_profile ON coach_profile.user_id = coach.id
  LEFT JOIN athlete_playlists ap ON ap.user_id = so.rider_id
`;

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
       FROM weekly_assignments WHERE active = 1 AND one_off = 0`,
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

// How far back the coach schedule API reaches, so the management calendar
// can show recent history alongside upcoming sessions.
const COACH_PAST_DAYS = 28;

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
       WHERE so.coach_id = ? AND so.occurrence_date >= date('now', ?)
       ORDER BY so.occurrence_date, so.start_time, so.id`,
    )
    .bind(coachId, `-${COACH_PAST_DAYS} days`)
    .all<OccurrenceRow>();

  return results.map(rowToOccurrence);
}

/**
 * Calendar feed for the viewer: everything they ride or coach, including
 * recent past weeks so navigating backwards is not a blank grid. Callers
 * pass the signed-in user's own id; the pages gate access themselves.
 */
export async function listOccurrencesForCalendar(
  db: D1Database,
  userId: number,
  pastDays: number = 28,
): Promise<SessionOccurrence[]> {
  await ensureOccurrencesGenerated(db);

  const { results } = await db
    .prepare(
      `${OCCURRENCE_SELECT}
       WHERE (so.rider_id = ? OR so.coach_id = ?)
         AND so.occurrence_date >= date('now', ?)
       ORDER BY so.occurrence_date, so.start_time, so.id`,
    )
    .bind(userId, userId, `-${pastDays} days`)
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

  const rescheduleDayOfWeek = new Date(`${occurrenceDate}T00:00:00Z`).getUTCDay();
  await assertBookable(
    db,
    coachId,
    existing.session_type,
    rescheduleDayOfWeek,
    startTime,
    existing.duration_minutes,
  );

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

/**
 * Moves an occurrence's whole recurring series to a new weekday/time: updates
 * the weekly assignment itself, then regenerates every future occurrence
 * from it. Only Intervals assignments recur — a one-off Lesson has no series
 * to update. `occurrenceDate` supplies the new weekday (any date on it works,
 * same as rescheduleOccurrence); it is not treated as a specific one-time date.
 */
export async function rescheduleAssignmentSeries(
  db: D1Database,
  input: RescheduleOccurrenceInput,
): Promise<void> {
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
      `SELECT wa.id AS weekly_assignment_id, wa.session_type, wa.one_off,
              wa.duration_minutes
       FROM session_occurrences so
       JOIN weekly_assignments wa ON wa.id = so.weekly_assignment_id
       WHERE so.id = ? AND so.coach_id = ? AND so.status = 'scheduled'`,
    )
    .bind(occurrenceId, coachId)
    .first<{
      weekly_assignment_id: number;
      session_type: string;
      one_off: number;
      duration_minutes: number;
    }>();

  if (!existing) {
    throw new ScheduleOccurrenceError("occurrence not found", 404);
  }
  if (existing.one_off === 1) {
    throw new ScheduleOccurrenceError(
      "a one-off session has no recurring series to update",
      400,
    );
  }

  const dayOfWeek = new Date(`${occurrenceDate}T00:00:00Z`).getUTCDay();

  await assertBookable(
    db,
    coachId,
    existing.session_type,
    dayOfWeek,
    startTime,
    existing.duration_minutes,
  );

  const collision = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM weekly_assignments
       WHERE coach_id = ? AND session_type = ? AND day_of_week = ?
         AND start_time = ? AND active = 1 AND id != ?`,
    )
    .bind(
      coachId,
      existing.session_type,
      dayOfWeek,
      startTime,
      existing.weekly_assignment_id,
    )
    .first<{ n: number }>();

  if ((collision?.n ?? 0) >= MAX_RIDERS_PER_SLOT) {
    throw new ScheduleOccurrenceError(
      "that day and time already has two riders scheduled",
      409,
    );
  }

  await db
    .prepare(
      `UPDATE weekly_assignments
       SET day_of_week = ?, start_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(dayOfWeek, startTime, existing.weekly_assignment_id)
    .run();

  // Drop every not-yet-happened occurrence generated under the old
  // weekday/time so the regeneration below rebuilds them on the new one.
  await db
    .prepare(
      `UPDATE session_occurrences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE weekly_assignment_id = ? AND status = 'scheduled'
         AND occurrence_date >= date('now')`,
    )
    .bind(existing.weekly_assignment_id)
    .run();

  await ensureOccurrencesGenerated(db);
}

/** Cancels an occurrence. Only the coach or an admin may. */
export async function cancelOccurrence(
  db: D1Database,
  actorId: number,
  coachId: number,
  occurrenceId: number,
): Promise<void> {
  await requireCoachOrAdmin(db, actorId, coachId);

  const result = await db
    .prepare(
      `UPDATE session_occurrences
       SET status = 'cancelled', rider_response = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND coach_id = ? AND status = 'scheduled'`,
    )
    .bind(occurrenceId, coachId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new ScheduleOccurrenceError("occurrence not found", 404);
  }
}

/**
 * Restores a cancelled occurrence back to scheduled. Only the coach or an
 * admin may. Subject to the same MAX_RIDERS_PER_SLOT check as reschedule, and
 * to the coach's current booking-window rules — a slot cancelled before a
 * blackout was configured cannot be restored into what is now blacked out.
 */
export async function restoreOccurrence(
  db: D1Database,
  actorId: number,
  coachId: number,
  occurrenceId: number,
): Promise<void> {
  await requireCoachOrAdmin(db, actorId, coachId);

  const occurrence = await db
    .prepare(
      `SELECT session_type, occurrence_date, start_time, duration_minutes
       FROM session_occurrences
       WHERE id = ? AND coach_id = ? AND status = 'cancelled'`,
    )
    .bind(occurrenceId, coachId)
    .first<{
      session_type: string;
      occurrence_date: string;
      start_time: string;
      duration_minutes: number;
    }>();

  if (!occurrence) {
    throw new ScheduleOccurrenceError("occurrence not found", 404);
  }

  const restoreDayOfWeek = new Date(
    `${occurrence.occurrence_date}T00:00:00Z`,
  ).getUTCDay();
  await assertBookable(
    db,
    coachId,
    occurrence.session_type,
    restoreDayOfWeek,
    occurrence.start_time,
    occurrence.duration_minutes,
  );

  const collision = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM session_occurrences
       WHERE coach_id = ? AND session_type = ? AND occurrence_date = ?
         AND start_time = ? AND status = 'scheduled' AND id != ?`,
    )
    .bind(
      coachId,
      occurrence.session_type,
      occurrence.occurrence_date,
      occurrence.start_time,
      occurrenceId,
    )
    .first<{ n: number }>();

  if ((collision?.n ?? 0) >= MAX_RIDERS_PER_SLOT) {
    throw new ScheduleOccurrenceError(
      "that date and time already has two riders scheduled",
      409,
    );
  }

  const result = await db
    .prepare(
      `UPDATE session_occurrences
       SET status = 'scheduled', rider_response = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND coach_id = ? AND status = 'cancelled'`,
    )
    .bind(occurrenceId, coachId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new ScheduleOccurrenceError("occurrence not found", 404);
  }
}

/**
 * Sets or clears the "not sure" flag on a still-scheduled occurrence. Does
 * not change status or slot occupancy. Only the coach or an admin may set
 * it — riders no longer have a way to change their own occurrences.
 */
export async function setOccurrenceResponse(
  db: D1Database,
  actorId: number,
  coachId: number,
  occurrenceId: number,
  response: "unsure" | null,
): Promise<void> {
  await requireCoachOrAdmin(db, actorId, coachId);

  const occurrence = await db
    .prepare(
      `SELECT id FROM session_occurrences
       WHERE id = ? AND coach_id = ? AND status = 'scheduled'`,
    )
    .bind(occurrenceId, coachId)
    .first<{ id: number }>();

  if (!occurrence) {
    throw new ScheduleOccurrenceError("occurrence not found", 404);
  }

  await db
    .prepare(
      `UPDATE session_occurrences SET rider_response = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(response, occurrenceId)
    .run();
}

const PRIVATE_NO_STORE = "private, no-store";

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

/** HTTP behavior for GET /api/admin/users/[id]/sessions: admin reads a rider's schedule. */
export async function handleGetUserSessions(
  db: D1Database,
  request: Request,
  userId: number,
): Promise<Response> {
  try {
    await requireAdminUser(db, request);
    return privateJson({
      sessions: await listOccurrencesForCalendar(db, userId),
    });
  } catch (error) {
    if (error instanceof PersonaChangeError) {
      return privateJson({ error: error.message }, error.status);
    }
    throw error;
  }
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
