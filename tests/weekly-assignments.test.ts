import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { saveCoachBookingWindows } from "@/lib/booking-windows";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import { ensureOccurrencesGenerated } from "@/lib/session-occurrences";
import {
  ScheduleAssignmentError,
  createWeeklyAssignment,
  deactivateWeeklyAssignment,
  getCoachDisplayName,
  listSchedulableRiders,
  listWeeklyAssignmentsForCoach,
  requireCoachOrAdmin,
} from "@/lib/weekly-assignments";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, display_name) VALUES (?, ?) RETURNING id",
  )
    .bind(googleSub, googleSub)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function createAdmin(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'admin')",
  )
    .bind(id)
    .run();
  return id;
}

async function createCoach(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'coach')",
  )
    .bind(id)
    .run();
  return id;
}

async function createRider(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await grantDefaultPersona(env.DB, id);
  await grantPersona(env.DB, {
    userId: id,
    persona: "theteam",
    grantedBy: await createAdmin(`${googleSub}-granter`),
  });
  return id;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("a coach can create a weekly assignment for an eligible rider", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");

  const assignment = await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  expect(assignment.riderId).toBe(rider);
  expect(assignment.dayOfWeek).toBe(2);
});

function futureIso(daysAhead: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

test("a lesson is a one-off on a specific date with its occurrence created immediately", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  const date = futureIso(7);

  const lesson = await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "lesson",
    dayOfWeek: 0, // ignored; derived from the date
    startTime: "17:00",
    durationMinutes: 60,
    occurrenceDate: date,
  });

  expect(lesson.sessionType).toBe("lesson");
  expect(lesson.oneOff).toBe(true);
  expect(lesson.occurrenceDate).toBe(date);
  expect(lesson.dayOfWeek).toBe(new Date(`${date}T00:00:00Z`).getUTCDay());

  const occurrences = await env.DB.prepare(
    "SELECT occurrence_date, status FROM session_occurrences WHERE weekly_assignment_id = ?",
  )
    .bind(lesson.id)
    .all<{ occurrence_date: string; status: string }>();
  expect(occurrences.results).toEqual([
    { occurrence_date: date, status: "scheduled" },
  ]);

  // Generation never turns a one-off into a recurring series.
  await ensureOccurrencesGenerated(env.DB);
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM session_occurrences WHERE weekly_assignment_id = ?",
  )
    .bind(lesson.id)
    .first<{ n: number }>();
  expect(count?.n).toBe(1);
});

test("a lesson requires a date, in the future; intervals must not take one", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  const base = {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  };

  await expect(
    createWeeklyAssignment(env.DB, { ...base, sessionType: "lesson" }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    createWeeklyAssignment(env.DB, {
      ...base,
      sessionType: "lesson",
      occurrenceDate: "2020-01-01",
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    createWeeklyAssignment(env.DB, {
      ...base,
      sessionType: "lesson",
      occurrenceDate: "not-a-date",
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    createWeeklyAssignment(env.DB, {
      ...base,
      sessionType: "intervals",
      occurrenceDate: futureIso(7),
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("a third lesson at the same date and time is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const date = futureIso(9);
  const base = {
    actorId: coach,
    coachId: coach,
    sessionType: "lesson" as const,
    dayOfWeek: 0,
    startTime: "17:00",
    durationMinutes: 60,
    occurrenceDate: date,
  };

  await createWeeklyAssignment(env.DB, { ...base, riderId: await createRider("sub-r1") });
  await createWeeklyAssignment(env.DB, { ...base, riderId: await createRider("sub-r2") });
  await expect(
    createWeeklyAssignment(env.DB, { ...base, riderId: await createRider("sub-r3") }),
  ).rejects.toMatchObject({ status: 409 });
});

test("a rider without a schedulable persona is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const memberOnly = await createUser("sub-member");
  await grantDefaultPersona(env.DB, memberOnly);

  await expect(
    createWeeklyAssignment(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: memberOnly,
      sessionType: "intervals",
      dayOfWeek: 2,
      startTime: "17:00",
      durationMinutes: 60,
    }),
  ).rejects.toBeInstanceOf(ScheduleAssignmentError);
});

test("a third rider at the same coach/day/time is rejected: only two bikes", async () => {
  const coach = await createCoach("sub-coach");
  const first = await createRider("sub-rider-1");
  const second = await createRider("sub-rider-2");
  const third = await createRider("sub-rider-3");
  const slot = {
    sessionType: "intervals" as const,
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  };

  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: first,
    ...slot,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: second,
    ...slot,
  });

  await expect(
    createWeeklyAssignment(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: third,
      ...slot,
    }),
  ).rejects.toMatchObject({
    status: 409,
    message:
      "There are no more slots left, sub-rider-1 and sub-rider-2 are scheduled at this time.",
  });
});

test("a coach cannot manage another coach's calendar", async () => {
  const coachA = await createCoach("sub-coach-a");
  const coachB = await createCoach("sub-coach-b");
  const rider = await createRider("sub-rider");

  await expect(
    createWeeklyAssignment(env.DB, {
      actorId: coachA,
      coachId: coachB,
      riderId: rider,
      sessionType: "intervals",
      dayOfWeek: 1,
      startTime: "09:00",
      durationMinutes: 60,
    }),
  ).rejects.toMatchObject({ status: 403 });
});

test("an admin can create an assignment on any coach's calendar", async () => {
  const admin = await createAdmin("sub-admin");
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");

  const assignment = await createWeeklyAssignment(env.DB, {
    actorId: admin,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 3,
    startTime: "18:00",
    durationMinutes: 60,
  });

  expect(assignment.coachId).toBe(coach);
});

test("an unrelated actor cannot view a coach's assignments", async () => {
  const coach = await createCoach("sub-coach");
  const bystander = await createUser("sub-bystander");

  await expect(
    listWeeklyAssignmentsForCoach(env.DB, bystander, coach),
  ).rejects.toBeInstanceOf(ScheduleAssignmentError);
});

test("deactivating an assignment cancels its own future scheduled occurrences", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  const assignment = await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await env.DB.prepare(
    `INSERT INTO session_occurrences
       (weekly_assignment_id, coach_id, rider_id, session_type, occurrence_date, start_time, duration_minutes)
     VALUES (?, ?, ?, 'intervals', date('now', '+7 days'), '17:00', 60)`,
  )
    .bind(assignment.id, coach, rider)
    .run();

  await deactivateWeeklyAssignment(env.DB, coach, coach, assignment.id);

  expect(await listWeeklyAssignmentsForCoach(env.DB, coach, coach)).toHaveLength(0);
  const occurrence = await env.DB.prepare(
    "SELECT status FROM session_occurrences WHERE weekly_assignment_id = ?",
  )
    .bind(assignment.id)
    .first<{ status: string }>();
  expect(occurrence?.status).toBe("cancelled");
});

test("listSchedulableRiders returns only theteam holders", async () => {
  const rider = await createRider("sub-rider");
  const coachOnly = await createCoach("sub-coach-only");

  const riders = await listSchedulableRiders(env.DB);

  expect(riders.map((r) => r.id)).toContain(rider);
  expect(riders.map((r) => r.id)).not.toContain(coachOnly);
});

test("requireCoachOrAdmin allows the coach themselves and admins, refuses everyone else", async () => {
  const coach = await createCoach("sub-coach");
  const admin = await createAdmin("sub-admin");
  const bystander = await createUser("sub-bystander");

  await expect(requireCoachOrAdmin(env.DB, coach, coach)).resolves.toBeUndefined();
  await expect(requireCoachOrAdmin(env.DB, admin, coach)).resolves.toBeUndefined();
  await expect(
    requireCoachOrAdmin(env.DB, bystander, coach),
  ).rejects.toMatchObject({ status: 403 });
});

test("scheduling shows the rider's profile display name, not the Google name", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await env.DB.prepare(
    "INSERT INTO profiles (user_id, slug, display_name, status) VALUES (?, ?, ?, 'approved')",
  )
    .bind(rider, `rider-${rider}`, "Rider Ray")
    .run();

  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  const assignments = await listWeeklyAssignmentsForCoach(env.DB, coach, coach);
  expect(assignments[0].riderDisplayName).toBe("Rider Ray");

  const riders = await listSchedulableRiders(env.DB);
  expect(riders.find((r) => r.id === rider)?.displayName).toBe("Rider Ray");
});

test("assignment listings carry the rider's Zone 5 power and profile slug", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await env.DB.prepare(
    "INSERT INTO profiles (user_id, slug, display_name, status) VALUES (?, ?, ?, 'approved')",
  )
    .bind(rider, `rider-${rider}`, "Rider Ray")
    .run();
  await env.DB.prepare(
    "INSERT INTO athlete_ftp (user_id, zone5_watts, updated_by) VALUES (?, 226, ?)",
  )
    .bind(rider, coach)
    .run();

  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  const [assignment] = await listWeeklyAssignmentsForCoach(env.DB, coach, coach);
  expect(assignment.riderZone5Watts).toBe(226);
  expect(assignment.riderSlug).toBe(`rider-${rider}`);
});

test("getCoachDisplayName returns the coach's name and stays authorized", async () => {
  const coach = await createCoach("sub-coach");
  const bystander = await createUser("sub-bystander");

  expect(await getCoachDisplayName(env.DB, coach, coach)).toBe("sub-coach");
  await expect(getCoachDisplayName(env.DB, bystander, coach)).rejects.toMatchObject({
    status: 403,
  });
});

test("a member-only account cannot fabricate a coach calendar by passing itself as coachId", async () => {
  const memberOnly = await createUser("sub-member-only");
  await grantDefaultPersona(env.DB, memberOnly);
  const rider = await createRider("sub-rider");

  await expect(
    createWeeklyAssignment(env.DB, {
      actorId: memberOnly,
      coachId: memberOnly,
      riderId: rider,
      sessionType: "intervals",
      dayOfWeek: 2,
      startTime: "17:00",
      durationMinutes: 60,
    }),
  ).rejects.toMatchObject({ status: 403 });
});

test("a weekly assignment on a day the coach has blacked out is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 0b0111110, // Mon-Fri
    blackouts: [null, null],
  });

  await expect(
    createWeeklyAssignment(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: rider,
      sessionType: "intervals",
      dayOfWeek: 0, // Sunday
      startTime: "17:00",
      durationMinutes: 60,
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("a weekly assignment inside a blackout time window is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 127,
    blackouts: [{ start: "00:00", end: "06:00" }, { start: "20:00", end: "23:59" }],
  });

  await expect(
    createWeeklyAssignment(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: rider,
      sessionType: "intervals",
      dayOfWeek: 2,
      startTime: "21:00",
      durationMinutes: 60,
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("a lesson date whose weekday is blacked out is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "lesson",
    allowedDaysMask: 0b0111110, // Mon-Fri
    blackouts: [null, null],
  });

  // Find the next Saturday (day 6), which the coach has blacked out.
  const date = new Date();
  while (date.getUTCDay() !== 6) date.setUTCDate(date.getUTCDate() + 1);
  const occurrenceDate = date.toISOString().slice(0, 10);

  await expect(
    createWeeklyAssignment(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: rider,
      sessionType: "lesson",
      dayOfWeek: 0,
      startTime: "10:00",
      durationMinutes: 60,
      occurrenceDate,
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("an assignment respecting the coach's booking windows still succeeds", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 127,
    blackouts: [{ start: "00:00", end: "06:00" }, { start: "20:00", end: "23:59" }],
  });

  const assignment = await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  expect(assignment.dayOfWeek).toBe(2);
});
