import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import {
  buildFeedForToken,
  CalendarFeedError,
  getOrCreateFeedToken,
  rotateFeedToken,
} from "@/lib/calendar-feed";
import {
  buildICalendar,
  CALENDAR_TIME_ZONE,
  eventStartEnd,
  googleCalendarTemplateUrl,
  REMINDER_MINUTES_BEFORE,
  type IcsEvent,
} from "@/lib/ics";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import {
  cancelOccurrence,
  ensureOccurrencesGenerated,
} from "@/lib/session-occurrences";
import { createWeeklyAssignment } from "@/lib/weekly-assignments";

async function createUser(
  googleSub: string,
  displayName: string,
): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, display_name) VALUES (?, ?) RETURNING id",
  )
    .bind(googleSub, displayName)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function createAdmin(googleSub: string): Promise<number> {
  const id = await createUser(googleSub, googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'admin')",
  )
    .bind(id)
    .run();
  return id;
}

async function createCoach(): Promise<number> {
  const id = await createUser("sub-coach", "Coach Carla");
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'coach')",
  )
    .bind(id)
    .run();
  return id;
}

async function createRider(
  googleSub: string,
  displayName: string,
): Promise<number> {
  const id = await createUser(googleSub, displayName);
  await grantDefaultPersona(env.DB, id);
  await grantPersona(env.DB, {
    userId: id,
    persona: "theteam",
    grantedBy: await createAdmin(`${googleSub}-granter`),
  });
  return id;
}

async function scheduleTuesdayIntervals(coach: number, rider: number) {
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await ensureOccurrencesGenerated(env.DB);
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

describe("feed tokens", () => {
  test("are created lazily and stable until rotated", async () => {
    const rider = await createRider("sub-rider", "Rider Ryan");
    const first = await getOrCreateFeedToken(env.DB, rider);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await getOrCreateFeedToken(env.DB, rider)).toBe(first);

    const rotated = await rotateFeedToken(env.DB, rider);
    expect(rotated).not.toBe(first);
    expect(await getOrCreateFeedToken(env.DB, rider)).toBe(rotated);
    await expect(buildFeedForToken(env.DB, first)).rejects.toMatchObject({
      status: 404,
    });
  });

  test("malformed and unknown tokens both get a 404", async () => {
    await expect(buildFeedForToken(env.DB, "not-a-token")).rejects.toBeInstanceOf(
      CalendarFeedError,
    );
    await expect(
      buildFeedForToken(env.DB, "a".repeat(64)),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("buildFeedForToken", () => {
  test("rider feed contains their sessions, addressed from their perspective", async () => {
    const coach = await createCoach();
    const rider = await createRider("sub-rider", "Rider Ryan");
    const otherRider = await createRider("sub-other", "Other Otto");
    await scheduleTuesdayIntervals(coach, rider);
    await scheduleTuesdayIntervals(coach, otherRider);

    const token = await getOrCreateFeedToken(env.DB, rider);
    const ics = await buildFeedForToken(env.DB, token);

    const { results: expected } = await env.DB.prepare(
      `SELECT id FROM session_occurrences
       WHERE rider_id = ? AND occurrence_date >= date('now')`,
    )
      .bind(rider)
      .all<{ id: number }>();

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:Radtrails Intervals");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(expected.length);
    expect(ics).toContain("SUMMARY:Intervals with Coach Coach Carla");
    expect(ics).not.toContain("Other Otto");
    for (const { id } of expected) {
      expect(ics).toContain(`UID:session-occurrence-${id}@radtrails.org`);
    }
    expect(ics).toContain(
      `DTSTART;TZID=${CALENDAR_TIME_ZONE}:`,
    );
    expect(ics).toContain(`TRIGGER:-PT${REMINDER_MINUTES_BEFORE}M`);
  });

  test("titles use profile display names, not Google account names", async () => {
    const coach = await createCoach();
    const rider = await createRider("sub-rider", "Rider Ryan");
    await env.DB.prepare(
      "INSERT INTO profiles (user_id, slug, display_name, status) VALUES (?, ?, ?, 'approved')",
    )
      .bind(rider, `rider-${rider}`, "Ryan Rides")
      .run();
    await scheduleTuesdayIntervals(coach, rider);

    const coachToken = await getOrCreateFeedToken(env.DB, coach);
    expect(await buildFeedForToken(env.DB, coachToken)).toContain(
      "SUMMARY:Intervals with Ryan Rides",
    );
  });

  test("session titles follow the assignment type", async () => {
    const coach = await createCoach();
    const rider = await createRider("sub-rider", "Rider Ryan");
    await createWeeklyAssignment(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: rider,
      sessionType: "lesson",
      dayOfWeek: 2,
      startTime: "17:00",
      durationMinutes: 60,
      occurrenceDate: new Date(Date.now() + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    });

    const token = await getOrCreateFeedToken(env.DB, rider);
    const ics = await buildFeedForToken(env.DB, token);

    expect(ics).toContain("SUMMARY:Lesson with Coach Coach Carla");
    expect(ics).not.toContain("SUMMARY:Intervals");
  });

  test("coach feed shows the sessions they coach with the rider named", async () => {
    const coach = await createCoach();
    const rider = await createRider("sub-rider", "Rider Ryan");
    await scheduleTuesdayIntervals(coach, rider);

    const token = await getOrCreateFeedToken(env.DB, coach);
    const ics = await buildFeedForToken(env.DB, token);

    expect(ics).toContain("SUMMARY:Intervals with Rider Ryan");
  });

  test("cancelled occurrences stay in the feed with STATUS:CANCELLED", async () => {
    const coach = await createCoach();
    const rider = await createRider("sub-rider", "Rider Ryan");
    await scheduleTuesdayIntervals(coach, rider);

    const occurrence = await env.DB.prepare(
      "SELECT id FROM session_occurrences WHERE rider_id = ? ORDER BY occurrence_date LIMIT 1",
    )
      .bind(rider)
      .first<{ id: number }>();
    await cancelOccurrence(env.DB, coach, coach, occurrence!.id);

    const token = await getOrCreateFeedToken(env.DB, rider);
    const ics = await buildFeedForToken(env.DB, token);

    expect(ics).toContain(`UID:session-occurrence-${occurrence!.id}@radtrails.org`);
    expect(ics).toContain("STATUS:CANCELLED");
  });
});

describe("ics formatting", () => {
  const baseEvent: IcsEvent = {
    uid: "test-1@radtrails.org",
    summary: "Intervals, with; special\nchars",
    description: null,
    date: "2026-08-20",
    startTime: "14:30",
    durationMinutes: 60,
    dtstamp: new Date("2026-08-19T12:00:00Z"),
  };

  test("eventStartEnd adds duration across midnight", () => {
    expect(
      eventStartEnd({
        ...baseEvent,
        startTime: "23:30",
        durationMinutes: 60,
      }),
    ).toEqual({ start: "20260820T233000", end: "20260821T003000" });
  });

  test("text is escaped and lines end CRLF", () => {
    const ics = buildICalendar([baseEvent], "Test");
    expect(ics).toContain("SUMMARY:Intervals\\, with\\; special\\nchars");
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    expect(ics).toContain("DTSTAMP:20260819T120000Z");
    expect(ics).toContain(
      `DTSTART;TZID=${CALENDAR_TIME_ZONE}:20260820T143000`,
    );
    expect(ics).toContain(`DTEND;TZID=${CALENDAR_TIME_ZONE}:20260820T153000`);
  });

  test("lines fold at 75 octets and unfold losslessly", () => {
    const description = "a".repeat(200);
    const ics = buildICalendar([{ ...baseEvent, description }], "Test");
    const physicalLines = ics.split("\r\n");

    for (const line of physicalLines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    const descriptionLines = physicalLines.filter(
      (line, index) =>
        line.startsWith("DESCRIPTION") ||
        (line.startsWith(" ") && physicalLines[index - 1] !== undefined),
    );
    expect(descriptionLines.length).toBeGreaterThan(1);
    // Unfolding (removing CRLF + leading space) restores the content.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`DESCRIPTION:${description}`);
  });

  test("google template link carries floating dates plus the zone", () => {
    const url = googleCalendarTemplateUrl(baseEvent);
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260820T143000%2F20260820T153000");
    expect(url).toContain(`ctz=${encodeURIComponent(CALENDAR_TIME_ZONE)}`);
  });
});
