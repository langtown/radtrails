import { isValidFtpWatts } from "./coaching-constraints";
import { requireCoachOrAdmin } from "./weekly-assignments";

export class FtpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FtpError";
    this.status = status;
  }
}

export type AthletePower = {
  userId: number;
  /** The rider's Zone 5 (VO2 Max) power — the one number the coach sets. */
  zone5Watts: number | null;
  updatedAt: string | null;
};

export type PowerZone = {
  zone: "Z1" | "Z2" | "Z3" | "Z4" | "Z5" | "Z6" | "Z7";
  label: string;
  /** Null for Z1, which is open-ended at the bottom. */
  minWatts: number | null;
  /** Null for Z7, which is open-ended at the top. */
  maxWatts: number | null;
};

export type DerivedPowerZones = {
  /** Reverse-engineered FTP: the Zone 5 midpoint is 113% of FTP. */
  ftpWatts: number;
  zones: PowerZone[];
};

/**
 * Dr. Coggan's power training zones, all seven, derived from the rider's
 * Zone 5 power. Zone bounds are computed from the unrounded derived FTP so
 * rounding never compounds across zones.
 */
export function deriveZonesFromZone5(zone5Watts: number): DerivedPowerZones {
  const ftp = zone5Watts / 1.13;
  const pct = (fraction: number) => Math.round(ftp * fraction);
  return {
    ftpWatts: Math.round(ftp),
    zones: [
      { zone: "Z1", label: "Active Recovery", minWatts: null, maxWatts: pct(0.55) },
      { zone: "Z2", label: "Endurance", minWatts: pct(0.56), maxWatts: pct(0.75) },
      { zone: "Z3", label: "Tempo", minWatts: pct(0.76), maxWatts: pct(0.9) },
      { zone: "Z4", label: "Lactate Threshold", minWatts: pct(0.91), maxWatts: pct(1.05) },
      { zone: "Z5", label: "VO2 Max", minWatts: pct(1.06), maxWatts: pct(1.2) },
      { zone: "Z6", label: "Anaerobic Capacity", minWatts: pct(1.21), maxWatts: pct(1.5) },
      { zone: "Z7", label: "Neuromuscular Power", minWatts: pct(1.51), maxWatts: null },
    ],
  };
}

/** The rider's own power number, for their profile page. No coach check — it is theirs. */
export async function getRiderPower(
  db: D1Database,
  riderId: number,
): Promise<AthletePower> {
  const row = await db
    .prepare(
      "SELECT user_id, zone5_watts, updated_at FROM athlete_ftp WHERE user_id = ?",
    )
    .bind(riderId)
    .first<{ user_id: number; zone5_watts: number; updated_at: string }>();

  return {
    userId: riderId,
    zone5Watts: row?.zone5_watts ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

async function requireActiveAssignment(
  db: D1Database,
  coachId: number,
  riderId: number,
  status: number,
): Promise<void> {
  const activeAssignment = await db
    .prepare(
      `SELECT 1 FROM weekly_assignments
       WHERE coach_id = ? AND rider_id = ? AND active = 1`,
    )
    .bind(coachId, riderId)
    .first();

  if (!activeAssignment) {
    throw new FtpError(
      "the rider has no active weekly assignment with this coach",
      status,
    );
  }
}

/** Power read for the coach (or admin) managing the rider. */
export async function getPowerForCoach(
  db: D1Database,
  actorId: number,
  coachId: number,
  riderId: number,
): Promise<AthletePower> {
  await requireCoachOrAdmin(db, actorId, coachId);
  await requireActiveAssignment(db, coachId, riderId, 403);
  return getRiderPower(db, riderId);
}

type SetPowerInput = {
  actorId: number;
  coachId: number;
  riderId: number;
  zone5Watts: number;
};

/** Coach (or admin) sets the rider's Zone 5 power. */
export async function setPower(
  db: D1Database,
  input: SetPowerInput,
): Promise<AthletePower> {
  const { actorId, coachId, riderId, zone5Watts } = input;
  await requireCoachOrAdmin(db, actorId, coachId);

  if (!isValidFtpWatts(zone5Watts)) {
    throw new FtpError(
      "Zone 5 power must be a whole watt value between 1 and 3000",
      400,
    );
  }
  await requireActiveAssignment(db, coachId, riderId, 409);

  await db
    .prepare(
      `INSERT INTO athlete_ftp (user_id, zone5_watts, updated_by)
       VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         zone5_watts = excluded.zone5_watts,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = excluded.updated_by`,
    )
    .bind(riderId, zone5Watts, actorId)
    .run();

  return getRiderPower(db, riderId);
}
