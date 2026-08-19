import {
  MAX_RIDERS_PER_SLOT,
  SCHEDULABLE_RIDER_PERSONAS,
  isValidDayOfWeek,
  isValidDurationMinutes,
  isValidSessionType,
  isValidTimeOfDay,
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

export type WeeklyAssignment = {
  id: number;
  coachId: number;
  riderId: number;
  riderDisplayName: string | null;
  sessionType: SessionType;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
};

async function riderDisplayName(
  db: D1Database,
  riderId: number,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT display_name FROM users WHERE id = ?")
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
  } = input;

  await requireCoachOrAdmin(db, actorId, coachId);

  if (!isValidSessionType(sessionType)) {
    throw new ScheduleAssignmentError("unknown session type", 400);
  }
  if (!isValidDayOfWeek(dayOfWeek)) {
    throw new ScheduleAssignmentError("day_of_week must be 0-6", 400);
  }
  if (!isValidTimeOfDay(startTime)) {
    throw new ScheduleAssignmentError("start_time must be HH:MM", 400);
  }
  if (!isValidDurationMinutes(durationMinutes)) {
    throw new ScheduleAssignmentError("duration_minutes must be 1-240", 400);
  }

  let riderEligible = false;
  for (const persona of SCHEDULABLE_RIDER_PERSONAS) {
    if (await hasPersona(db, riderId, persona)) {
      riderEligible = true;
      break;
    }
  }
  if (!riderEligible) {
    throw new ScheduleAssignmentError(
      "the rider does not hold a schedulable persona",
      400,
    );
  }

  const occupied = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM weekly_assignments
       WHERE coach_id = ? AND session_type = ? AND day_of_week = ?
         AND start_time = ? AND active = 1`,
    )
    .bind(coachId, sessionType, dayOfWeek, startTime)
    .first<{ n: number }>();

  if ((occupied?.n ?? 0) >= MAX_RIDERS_PER_SLOT) {
    throw new ScheduleAssignmentError(
      "that slot already has two riders scheduled",
      409,
    );
  }

  const row = await db
    .prepare(
      `INSERT INTO weekly_assignments
         (coach_id, rider_id, session_type, day_of_week, start_time, duration_minutes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      coachId,
      riderId,
      sessionType,
      dayOfWeek,
      startTime,
      durationMinutes,
      actorId,
    )
    .first<{ id: number }>();

  if (!row) {
    throw new ScheduleAssignmentError("failed to create assignment", 500);
  }

  return {
    id: row.id,
    coachId,
    riderId,
    riderDisplayName: await riderDisplayName(db, riderId),
    sessionType,
    dayOfWeek,
    startTime,
    durationMinutes,
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
      `SELECT wa.id, wa.coach_id, wa.rider_id, u.display_name AS rider_display_name,
              wa.session_type, wa.day_of_week, wa.start_time, wa.duration_minutes
       FROM weekly_assignments wa
       JOIN users u ON u.id = wa.rider_id
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

export type SchedulableRider = { id: number; displayName: string | null };

/** Every account holding a persona eligible to be scheduled (currently theteam). */
export async function listSchedulableRiders(
  db: D1Database,
): Promise<SchedulableRider[]> {
  const placeholders = SCHEDULABLE_RIDER_PERSONAS.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT DISTINCT u.id, u.display_name
       FROM users u
       JOIN user_personas up ON up.user_id = u.id
       WHERE up.persona_key IN (${placeholders})
       ORDER BY u.display_name, u.id`,
    )
    .bind(...SCHEDULABLE_RIDER_PERSONAS)
    .all<{ id: number; display_name: string | null }>();

  return results.map((row) => ({ id: row.id, displayName: row.display_name }));
}
