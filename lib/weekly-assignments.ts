import { assertBookable } from "./booking-windows";
import {
  MAX_RIDERS_PER_SLOT,
  SCHEDULABLE_RIDER_PERSONAS,
  isValidDayOfWeek,
  isValidDurationMinutes,
  isValidIsoDate,
  isValidSessionType,
  isValidTimeOfDay,
  todayIso,
  type SessionType,
} from "./coaching-constraints";
import { hasPersona } from "./personas";

export class ScheduleAssignmentError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ScheduleAssignmentError";
    this.status = status;
  }
}

/** Confirms the actor may manage coachId's calendar: that coach, or an admin. */
export async function requireCoachOrAdmin(
  db: D1Database,
  actorId: number,
  coachId: number,
): Promise<void> {
  if (!(await hasPersona(db, coachId, "coach"))) {
    throw new ScheduleAssignmentError(
      "that account does not have a coach calendar",
      403,
    );
  }
  if (actorId === coachId) return;
  if (await hasPersona(db, actorId, "admin")) return;
  throw new ScheduleAssignmentError(
    "only the coach or an admin may manage this calendar",
    403,
  );
}

/** Whether this user holds any persona that may be scheduled as a rider. */
export async function isSchedulableRider(
  db: D1Database,
  userId: number,
): Promise<boolean> {
  for (const persona of SCHEDULABLE_RIDER_PERSONAS) {
    if (await hasPersona(db, userId, persona)) return true;
  }
  return false;
}

export type WeeklyAssignment = {
  id: number;
  coachId: number;
  riderId: number;
  riderDisplayName: string | null;
  sessionType: SessionType;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  /** Lessons are one-off appointments on this date; Intervals recur weekly. */
  oneOff: boolean;
  occurrenceDate: string | null;
  /** The rider's coach-set Zone 5 power, when one exists. */
  riderZone5Watts: number | null;
  /** The rider's profile slug, when they have a profile. */
  riderSlug: string | null;
};

async function riderDisplayName(
  db: D1Database,
  riderId: number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT COALESCE(p.display_name, u.display_name) AS display_name
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
    )
    .bind(riderId)
    .first<{ display_name: string | null }>();
  return row?.display_name ?? null;
}

type CreateWeeklyAssignmentInput = {
  actorId: number;
  coachId: number;
  riderId: number;
  sessionType: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  /** Required for lesson (one-off date); must be absent for intervals. */
  occurrenceDate?: string;
};

export async function createWeeklyAssignment(
  db: D1Database,
  input: CreateWeeklyAssignmentInput,
): Promise<WeeklyAssignment> {
  const {
    actorId,
    coachId,
    riderId,
    sessionType,
    dayOfWeek,
    startTime,
    durationMinutes,
    occurrenceDate,
  } = input;

  await requireCoachOrAdmin(db, actorId, coachId);

  if (!isValidSessionType(sessionType)) {
    throw new ScheduleAssignmentError("unknown session type", 400);
  }
  const oneOff = sessionType === "lesson";
  if (oneOff) {
    if (occurrenceDate === undefined) {
      throw new ScheduleAssignmentError(
        "a lesson requires a specific date",
        400,
      );
    }
    if (!isValidIsoDate(occurrenceDate)) {
      throw new ScheduleAssignmentError(
        "occurrence_date must be YYYY-MM-DD",
        400,
      );
    }
    if (occurrenceDate < todayIso()) {
      throw new ScheduleAssignmentError(
        "a lesson cannot be scheduled in the past",
        400,
      );
    }
  } else if (occurrenceDate !== undefined) {
    throw new ScheduleAssignmentError(
      "intervals recur weekly and do not take a date",
      400,
    );
  }
  // A lesson's weekday comes from its date; intervals take the chosen day.
  const effectiveDayOfWeek = oneOff
    ? new Date(`${occurrenceDate}T00:00:00Z`).getUTCDay()
    : dayOfWeek;
  if (!isValidDayOfWeek(effectiveDayOfWeek)) {
    throw new ScheduleAssignmentError("day_of_week must be 0-6", 400);
  }
  if (!isValidTimeOfDay(startTime)) {
    throw new ScheduleAssignmentError("start_time must be HH:MM", 400);
  }
  if (!isValidDurationMinutes(durationMinutes)) {
    throw new ScheduleAssignmentError("duration_minutes must be 1-240", 400);
  }

  await assertBookable(
    db,
    coachId,
    sessionType,
    effectiveDayOfWeek,
    startTime,
    durationMinutes,
  );

  if (!(await isSchedulableRider(db, riderId))) {
    throw new ScheduleAssignmentError(
      "the rider does not hold a schedulable persona",
      400,
    );
  }

  // Intervals share a weekly slot; lessons share their specific date/time.
  const occupants = oneOff
    ? (
        await db
          .prepare(
            `SELECT COALESCE(p.display_name, u.display_name) AS display_name
             FROM session_occurrences so
             JOIN users u ON u.id = so.rider_id
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE so.coach_id = ? AND so.session_type = ?
               AND so.occurrence_date = ? AND so.start_time = ?
               AND so.status = 'scheduled'`,
          )
          .bind(coachId, sessionType, occurrenceDate, startTime)
          .all<{ display_name: string | null }>()
      ).results
    : (
        await db
          .prepare(
            `SELECT COALESCE(p.display_name, u.display_name) AS display_name
             FROM weekly_assignments wa
             JOIN users u ON u.id = wa.rider_id
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE wa.coach_id = ? AND wa.session_type = ?
               AND wa.day_of_week = ? AND wa.start_time = ? AND wa.active = 1`,
          )
          .bind(coachId, sessionType, effectiveDayOfWeek, startTime)
          .all<{ display_name: string | null }>()
      ).results;

  if (occupants.length >= MAX_RIDERS_PER_SLOT) {
    const names = occupants
      .map((occupant) => occupant.display_name ?? "a rider")
      .join(" and ");
    throw new ScheduleAssignmentError(
      `There are no more slots left, ${names} are scheduled at this time.`,
      409,
    );
  }

  const row = await db
    .prepare(
      `INSERT INTO weekly_assignments
         (coach_id, rider_id, session_type, day_of_week, start_time, duration_minutes, created_by, one_off)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      coachId,
      riderId,
      sessionType,
      effectiveDayOfWeek,
      startTime,
      durationMinutes,
      actorId,
      oneOff ? 1 : 0,
    )
    .first<{ id: number }>();

  if (!row) {
    throw new ScheduleAssignmentError("failed to create assignment", 500);
  }

  if (oneOff) {
    await db
      .prepare(
        `INSERT INTO session_occurrences
           (weekly_assignment_id, coach_id, rider_id, session_type,
            occurrence_date, start_time, duration_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        coachId,
        riderId,
        sessionType,
        occurrenceDate,
        startTime,
        durationMinutes,
      )
      .run();
  }

  const riderMeta = await db
    .prepare(
      `SELECT af.zone5_watts, p.slug
       FROM users u
       LEFT JOIN athlete_ftp af ON af.user_id = u.id
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
    )
    .bind(riderId)
    .first<{ zone5_watts: number | null; slug: string | null }>();

  return {
    id: row.id,
    coachId,
    riderId,
    riderDisplayName: await riderDisplayName(db, riderId),
    sessionType,
    dayOfWeek: effectiveDayOfWeek,
    startTime,
    durationMinutes,
    oneOff,
    occurrenceDate: oneOff && occurrenceDate !== undefined ? occurrenceDate : null,
    riderZone5Watts: riderMeta?.zone5_watts ?? null,
    riderSlug: riderMeta?.slug ?? null,
  };
}

export async function listWeeklyAssignmentsForCoach(
  db: D1Database,
  actorId: number,
  coachId: number,
): Promise<WeeklyAssignment[]> {
  await requireCoachOrAdmin(db, actorId, coachId);

  const { results } = await db
    .prepare(
      `SELECT wa.id, wa.coach_id, wa.rider_id,
              COALESCE(p.display_name, u.display_name) AS rider_display_name,
              wa.session_type, wa.day_of_week, wa.start_time, wa.duration_minutes,
              wa.one_off,
              (SELECT so.occurrence_date FROM session_occurrences so
                 WHERE so.weekly_assignment_id = wa.id
                 ORDER BY so.occurrence_date LIMIT 1) AS occurrence_date,
              af.zone5_watts AS rider_zone5_watts,
              p.slug AS rider_slug
       FROM weekly_assignments wa
       JOIN users u ON u.id = wa.rider_id
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN athlete_ftp af ON af.user_id = wa.rider_id
       WHERE wa.coach_id = ? AND wa.active = 1
       ORDER BY wa.day_of_week, wa.start_time, wa.id`,
    )
    .bind(coachId)
    .all<{
      id: number;
      coach_id: number;
      rider_id: number;
      rider_display_name: string | null;
      session_type: string;
      day_of_week: number;
      start_time: string;
      duration_minutes: number;
      one_off: number;
      occurrence_date: string | null;
      rider_zone5_watts: number | null;
      rider_slug: string | null;
    }>();

  return results.map((row) => ({
    id: row.id,
    coachId: row.coach_id,
    riderId: row.rider_id,
    riderDisplayName: row.rider_display_name,
    sessionType: row.session_type as SessionType,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    oneOff: row.one_off === 1,
    occurrenceDate: row.occurrence_date,
    riderZone5Watts: row.rider_zone5_watts,
    riderSlug: row.rider_slug,
  }));
}

/**
 * Deactivates a weekly assignment and cancels its own future scheduled
 * occurrences, so removing a rider frees the slot immediately rather than
 * leaving stale weeks behind.
 */
export async function deactivateWeeklyAssignment(
  db: D1Database,
  actorId: number,
  coachId: number,
  assignmentId: number,
): Promise<void> {
  await requireCoachOrAdmin(db, actorId, coachId);

  const result = await db
    .prepare(
      `UPDATE weekly_assignments SET active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND coach_id = ? AND active = 1`,
    )
    .bind(assignmentId, coachId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new ScheduleAssignmentError("assignment not found", 404);
  }

  await db
    .prepare(
      `UPDATE session_occurrences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE weekly_assignment_id = ? AND status = 'scheduled'
         AND occurrence_date >= date('now')`,
    )
    .bind(assignmentId)
    .run();
}

/** The coach calendar owner's name, for page headings. Same authorization as the calendar itself. */
export async function getCoachDisplayName(
  db: D1Database,
  actorId: number,
  coachId: number,
): Promise<string | null> {
  await requireCoachOrAdmin(db, actorId, coachId);
  const row = await db
    .prepare(
      `SELECT COALESCE(p.display_name, u.display_name) AS display_name
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
    )
    .bind(coachId)
    .first<{ display_name: string | null }>();
  return row?.display_name ?? null;
}

export type SchedulableRider = { id: number; displayName: string | null };

/** Every account holding a persona eligible to be scheduled (currently theteam). */
export async function listSchedulableRiders(
  db: D1Database,
): Promise<SchedulableRider[]> {
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
