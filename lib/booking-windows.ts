import { DAYS_OF_WEEK, isValidTimeOfDay } from "./coaching-constraints";
import { requireCoachOrAdmin } from "./weekly-assignments";

export class BookingWindowError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BookingWindowError";
    this.status = status;
  }
}

/** Bit i (0=Sun..6=Sat) set = bookable. Default: every day allowed. */
export const ALL_DAYS_MASK = 0b1111111;

/** Booking rules only ever apply to these session types; practice rides never are. */
export const BOOKABLE_SESSION_TYPES = ["intervals", "lesson"] as const;
export type BookableSessionType = (typeof BOOKABLE_SESSION_TYPES)[number];

export function isBookableSessionType(
  value: string,
): value is BookableSessionType {
  return (BOOKABLE_SESSION_TYPES as readonly string[]).includes(value);
}

export type BlackoutWindow = { start: string; end: string };

export type BookingWindows = {
  allowedDaysMask: number;
  /** 0-2 windows, in the order they were saved. */
  blackouts: BlackoutWindow[];
};

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

type BookingWindowRow = {
  allowed_days_mask: number;
  blackout_1_start: string | null;
  blackout_1_end: string | null;
  blackout_2_start: string | null;
  blackout_2_end: string | null;
};

function rowToWindows(row: BookingWindowRow): BookingWindows {
  const blackouts: BlackoutWindow[] = [];
  if (row.blackout_1_start && row.blackout_1_end) {
    blackouts.push({ start: row.blackout_1_start, end: row.blackout_1_end });
  }
  if (row.blackout_2_start && row.blackout_2_end) {
    blackouts.push({ start: row.blackout_2_start, end: row.blackout_2_end });
  }
  return { allowedDaysMask: row.allowed_days_mask, blackouts };
}

/**
 * Null means the coach has never configured booking rules for this session
 * type: every day and time is bookable, so an unconfigured type is
 * unaffected until the coach opts in.
 */
export async function getCoachBookingWindows(
  db: D1Database,
  coachId: number,
  sessionType: BookableSessionType,
): Promise<BookingWindows | null> {
  const row = await db
    .prepare(
      `SELECT allowed_days_mask, blackout_1_start, blackout_1_end,
              blackout_2_start, blackout_2_end
       FROM coach_booking_windows WHERE coach_id = ? AND session_type = ?`,
    )
    .bind(coachId, sessionType)
    .first<BookingWindowRow>();
  if (!row) return null;
  return rowToWindows(row);
}

/** Both booking rule sets for a coach, keyed by session type. */
export async function getAllCoachBookingWindows(
  db: D1Database,
  coachId: number,
): Promise<Record<BookableSessionType, BookingWindows | null>> {
  const entries = await Promise.all(
    BOOKABLE_SESSION_TYPES.map(async (sessionType) => [
      sessionType,
      await getCoachBookingWindows(db, coachId, sessionType),
    ] as const),
  );
  return Object.fromEntries(entries) as Record<
    BookableSessionType,
    BookingWindows | null
  >;
}

type SaveCoachBookingWindowsInput = {
  actorId: number;
  coachId: number;
  sessionType: BookableSessionType;
  allowedDaysMask: number;
  /** Exactly two slots; either may be null to leave that window unused. */
  blackouts: [BlackoutWindow | null, BlackoutWindow | null];
};

/**
 * Parses one blackout window from an untrusted request body: null/undefined
 * means "unused", anything else must be a {start, end} pair of strings (their
 * HH:MM format and ordering are checked later, by validateWindow).
 */
export function parseBlackoutInput(value: unknown): BlackoutWindow | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "object" ||
    typeof (value as { start?: unknown }).start !== "string" ||
    typeof (value as { end?: unknown }).end !== "string"
  ) {
    throw new BookingWindowError(
      "each blackout window needs start and end as HH:MM strings",
      400,
    );
  }
  const window = value as { start: string; end: string };
  return { start: window.start, end: window.end };
}

function validateWindow(window: BlackoutWindow | null): BlackoutWindow | null {
  if (window === null) return null;
  if (!isValidTimeOfDay(window.start) || !isValidTimeOfDay(window.end)) {
    throw new BookingWindowError("blackout times must be HH:MM", 400);
  }
  if (toMinutes(window.start) >= toMinutes(window.end)) {
    throw new BookingWindowError(
      "a blackout window's start must be before its end",
      400,
    );
  }
  return window;
}

export async function saveCoachBookingWindows(
  db: D1Database,
  input: SaveCoachBookingWindowsInput,
): Promise<BookingWindows> {
  const { actorId, coachId, sessionType, allowedDaysMask, blackouts } = input;
  await requireCoachOrAdmin(db, actorId, coachId);

  if (
    !Number.isInteger(allowedDaysMask) ||
    allowedDaysMask < 1 ||
    allowedDaysMask > ALL_DAYS_MASK
  ) {
    throw new BookingWindowError("at least one day must be allowed", 400);
  }

  const [window1, window2] = [
    validateWindow(blackouts[0]),
    validateWindow(blackouts[1]),
  ];

  await db
    .prepare(
      `INSERT INTO coach_booking_windows
         (coach_id, session_type, allowed_days_mask, blackout_1_start, blackout_1_end,
          blackout_2_start, blackout_2_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (coach_id, session_type) DO UPDATE SET
         allowed_days_mask = excluded.allowed_days_mask,
         blackout_1_start = excluded.blackout_1_start,
         blackout_1_end = excluded.blackout_1_end,
         blackout_2_start = excluded.blackout_2_start,
         blackout_2_end = excluded.blackout_2_end,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      coachId,
      sessionType,
      allowedDaysMask,
      window1?.start ?? null,
      window1?.end ?? null,
      window2?.start ?? null,
      window2?.end ?? null,
    )
    .run();

  return {
    allowedDaysMask,
    blackouts: [window1, window2].filter(
      (window): window is BlackoutWindow => window !== null,
    ),
  };
}

function overlaps(
  sessionStart: number,
  sessionEnd: number,
  blackoutStart: number,
  blackoutEnd: number,
): boolean {
  return sessionStart < blackoutEnd && sessionEnd > blackoutStart;
}

/**
 * Throws when the coach has configured rules that forbid this day/time.
 * No-op when the coach has no configuration, or when sessionType isn't
 * Intervals or Lesson — booking rules never apply to practice rides.
 */
export async function assertBookable(
  db: D1Database,
  coachId: number,
  sessionType: string,
  dayOfWeek: number,
  startTime: string,
  durationMinutes: number,
): Promise<void> {
  if (!isBookableSessionType(sessionType)) return;

  const windows = await getCoachBookingWindows(db, coachId, sessionType);
  if (!windows) return;

  if (((windows.allowedDaysMask >> dayOfWeek) & 1) === 0) {
    throw new BookingWindowError(
      `${DAYS_OF_WEEK[dayOfWeek]} is not a bookable day for this coach.`,
      400,
    );
  }

  const sessionStart = toMinutes(startTime);
  const sessionEnd = sessionStart + durationMinutes;
  for (const blackout of windows.blackouts) {
    if (
      overlaps(
        sessionStart,
        sessionEnd,
        toMinutes(blackout.start),
        toMinutes(blackout.end),
      )
    ) {
      throw new BookingWindowError(
        `${startTime} falls in a coach blackout window (${blackout.start}-${blackout.end}).`,
        400,
      );
    }
  }
}
