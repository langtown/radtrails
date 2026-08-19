import { isValidFtpWatts, isValidSessionType, type SessionType } from "./coaching-constraints";
import { requireCoachOrAdmin } from "./weekly-assignments";

export class FtpZoneError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FtpZoneError";
    this.status = status;
  }
}

export type FtpZones = {
  userId: number;
  sessionType: SessionType;
  z1Watts: number | null;
  z2Watts: number | null;
  z3Watts: number | null;
  z4Watts: number | null;
  z5Watts: number | null;
  updatedAt: string | null;
};

export async function getFtpZones(
  db: D1Database,
  actorId: number,
  coachId: number,
  riderId: number,
  sessionType: string,
): Promise<FtpZones> {
  await requireCoachOrAdmin(db, actorId, coachId);
  if (!isValidSessionType(sessionType)) {
    throw new FtpZoneError("unknown session type", 400);
  }

  const activeAssignment = await db
    .prepare(
      `SELECT 1 FROM weekly_assignments
       WHERE coach_id = ? AND rider_id = ? AND session_type = ? AND active = 1`,
    )
    .bind(coachId, riderId, sessionType)
    .first();

  if (!activeAssignment) {
    throw new FtpZoneError(
      "the rider has no active weekly assignment with this coach for this session type",
      403,
    );
  }

  const row = await db
    .prepare(
      `SELECT user_id, session_type, z1_watts, z2_watts, z3_watts, z4_watts, z5_watts, updated_at
       FROM athlete_ftp_zones WHERE user_id = ? AND session_type = ?`,
    )
    .bind(riderId, sessionType)
    .first<{
      user_id: number;
      session_type: string;
      z1_watts: number | null;
      z2_watts: number | null;
      z3_watts: number | null;
      z4_watts: number | null;
      z5_watts: number | null;
      updated_at: string;
    }>();

  if (!row) {
    return {
      userId: riderId,
      sessionType: sessionType as SessionType,
      z1Watts: null,
      z2Watts: null,
      z3Watts: null,
      z4Watts: null,
      z5Watts: null,
      updatedAt: null,
    };
  }

  return {
    userId: row.user_id,
    sessionType: row.session_type as SessionType,
    z1Watts: row.z1_watts,
    z2Watts: row.z2_watts,
    z3Watts: row.z3_watts,
    z4Watts: row.z4_watts,
    z5Watts: row.z5_watts,
    updatedAt: row.updated_at,
  };
}

type SetFtpZonesInput = {
  actorId: number;
  coachId: number;
  riderId: number;
  sessionType: string;
  z1Watts: number;
  z2Watts: number;
  z3Watts: number;
  z4Watts: number;
  z5Watts: number;
};

export async function setFtpZones(
  db: D1Database,
  input: SetFtpZonesInput,
): Promise<FtpZones> {
  const {
    actorId,
    coachId,
    riderId,
    sessionType,
    z1Watts,
    z2Watts,
    z3Watts,
    z4Watts,
    z5Watts,
  } = input;
  await requireCoachOrAdmin(db, actorId, coachId);

  if (!isValidSessionType(sessionType)) {
    throw new FtpZoneError("unknown session type", 400);
  }
  for (const watts of [z1Watts, z2Watts, z3Watts, z4Watts, z5Watts]) {
    if (!isValidFtpWatts(watts)) {
      throw new FtpZoneError(
        "each zone must be a whole watt value between 1 and 3000",
        400,
      );
    }
  }

  const activeAssignment = await db
    .prepare(
      `SELECT 1 FROM weekly_assignments
       WHERE coach_id = ? AND rider_id = ? AND session_type = ? AND active = 1`,
    )
    .bind(coachId, riderId, sessionType)
    .first();

  if (!activeAssignment) {
    throw new FtpZoneError(
      "the rider has no active weekly assignment with this coach for this session type",
      409,
    );
  }

  await db
    .prepare(
      `INSERT INTO athlete_ftp_zones
         (user_id, session_type, z1_watts, z2_watts, z3_watts, z4_watts, z5_watts, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, session_type) DO UPDATE SET
         z1_watts = excluded.z1_watts,
         z2_watts = excluded.z2_watts,
         z3_watts = excluded.z3_watts,
         z4_watts = excluded.z4_watts,
         z5_watts = excluded.z5_watts,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = excluded.updated_by`,
    )
    .bind(riderId, sessionType, z1Watts, z2Watts, z3Watts, z4Watts, z5Watts, actorId)
    .run();

  return getFtpZones(db, actorId, coachId, riderId, sessionType);
}
