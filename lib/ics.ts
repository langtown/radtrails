/**
 * Pure iCalendar (RFC 5545) building blocks. No D1, no auth, no Request —
 * safe to import from server handlers, tests, and client components alike.
 */

/**
 * Sessions are scheduled in site-local wall-clock time (Thousand Oaks, CA).
 * Events are emitted as local times tagged with this IANA zone rather than
 * converted to UTC, so a schedule stays at "5pm with the coach" even across
 * DST changes. Google Calendar and Apple Calendar both resolve Olson names.
 */
export const CALENDAR_TIME_ZONE = "America/Los_Angeles";

/** Default reminder attached to every event. */
export const REMINDER_MINUTES_BEFORE = 30;

export type IcsEvent = {
  uid: string;
  summary: string;
  description?: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, site-local */
  startTime: string;
  durationMinutes: number;
  cancelled?: boolean;
  /** Defaults to now; injectable so tests are deterministic. */
  dtstamp?: Date;
};

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Folds a content line to 75 octets per RFC 5545 §3.1: continuation lines
 * start with a single space, and splits never land inside a UTF-8 sequence.
 */
function foldLine(line: string): string[] {
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return [line];

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let start = 0;
  let budget = 75;
  while (start < bytes.length) {
    let end = Math.min(start + budget, bytes.length);
    // Back off a UTF-8 continuation boundary so no character is split.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end -= 1;
    }
    chunks.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
    budget = 74; // continuation lines carry a leading space
  }
  return chunks.map((chunk, index) =>
    index === 0 ? chunk : ` ${chunk}`,
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalDateTime(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}`
  );
}

function formatUtcDateTime(date: Date): string {
  return `${formatLocalDateTime(date)}Z`;
}

/**
 * Parses the event's local wall clock as if it were UTC and adds the
 * duration. Treating the clock abstractly keeps this arithmetic free of the
 * host's timezone; the TZID on the property is what anchors it for clients.
 */
export function eventStartEnd(event: IcsEvent): { start: string; end: string } {
  const start = new Date(`${event.date}T${event.startTime}:00Z`);
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);
  return { start: formatLocalDateTime(start), end: formatLocalDateTime(end) };
}

function vEventLines(event: IcsEvent): string[] {
  const { start, end } = eventStartEnd(event);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${formatUtcDateTime(event.dtstamp ?? new Date())}`,
    `DTSTART;TZID=${CALENDAR_TIME_ZONE}:${start}`,
    `DTEND;TZID=${CALENDAR_TIME_ZONE}:${end}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
  ];
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }
  if (event.cancelled) {
    lines.push("STATUS:CANCELLED");
  }
  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:-PT${REMINDER_MINUTES_BEFORE}M`,
    `DESCRIPTION:${escapeIcsText(event.summary)}`,
    "END:VALARM",
    "END:VEVENT",
  );
  return lines;
}

export function buildICalendar(events: IcsEvent[], calendarName: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//radtrails.org//Intervals//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-TIMEZONE:${CALENDAR_TIME_ZONE}`,
    ...events.flatMap(vEventLines),
    "END:VCALENDAR",
  ];
  return `${lines.flatMap(foldLine).join("\r\n")}\r\n`;
}

/**
 * Single-event "Add to Google Calendar" template link. Dates are floating
 * local times pinned by `ctz`, matching the TZID semantics of the feeds.
 */
export function googleCalendarTemplateUrl(event: IcsEvent): string {
  const { start, end } = eventStartEnd(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.summary,
    dates: `${start}/${end}`,
    ctz: CALENDAR_TIME_ZONE,
  });
  if (event.description) params.set("details", event.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
