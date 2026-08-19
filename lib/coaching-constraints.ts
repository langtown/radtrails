/** The only session category today. Adding a second is a code change here, not a schema migration. */
export const SESSION_TYPES = ["intervals"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/** Which personas may be scheduled as a rider. Extending this list is the whole change. */
export const SCHEDULABLE_RIDER_PERSONAS = ["theteam"] as const;

/** How far ahead dated occurrences are kept generated. */
export const OCCURRENCE_WINDOW_WEEKS = 8;

/** Two bikes: a coach's slot can hold at most this many riders. */
export const MAX_RIDERS_PER_SLOT = 2;

export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function isValidSessionType(value: unknown): value is SessionType {
  return (
    typeof value === "string" &&
    (SESSION_TYPES as readonly string[]).includes(value)
  );
}

export function isValidDayOfWeek(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  );
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeOfDay(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function isValidDurationMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 240
  );
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    value === parsed.toISOString().slice(0, 10)
  );
}

export function isValidFtpWatts(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 3000
  );
}
