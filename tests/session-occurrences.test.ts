import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { BookingWindowError, saveCoachBookingWindows } from "@/lib/booking-windows";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import { createWeeklyAssignment } from "@/lib/weekly-assignments";
import {
  ScheduleOccurrenceError,
  cancelOccurrence,
  ensureOccurrencesGenerated,
  listOccurrencesForCoach,
  listOccurrencesForRider,
  rescheduleAssignmentSeries,
  rescheduleOccurrence,
  restoreOccurrence,
  setOccurrenceResponse,
} from "@/lib/session-occurrences";

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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

test("generation is idempotent: calling it twice does not duplicate rows", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });

  await ensureOccurrencesGenerated(env.DB);
  const first = await listOccurrencesForCoach(env.DB, coach, coach);
  await ensureOccurrencesGenerated(env.DB);
  const second = await listOccurrencesForCoach(env.DB, coach, coach);

  expect(second).toHaveLength(first.length);
});

test("generation produces about 8 weeks of occurrences for one assignment", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });

  const occurrences = await listOccurrencesForCoach(env.DB, coach, coach);

  expect(occurrences.length).toBeGreaterThanOrEqual(8);
  expect(occurrences.length).toBeLessThanOrEqual(9);
});

test("a rider sees their own upcoming sessions with their playlist attached", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  await env.DB.prepare(
    "INSERT INTO athlete_playlists (user_id, playlist_url) VALUES (?, 'https://open.spotify.com/playlist/abc')",
  )
    .bind(rider)
    .run();

  const sessions = await listOccurrencesForRider(env.DB, rider);

  expect(sessions.length).toBeGreaterThan(0);
  expect(sessions[0].riderPlaylistUrl).toBe(
    "https://open.spotify.com/playlist/abc",
  );
});

test("rescheduling to a free slot succeeds", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  const updated = await rescheduleOccurrence(env.DB, {
    actorId: coach,
    coachId: coach,
    occurrenceId: occurrence.id,
    occurrenceDate: occurrence.occurrenceDate,
    startTime: "20:00",
  });

  expect(updated.startTime).toBe("20:00");
});

test("rescheduling into an already-full slot is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const riderA = await createRider("sub-rider-a");
  const riderB = await createRider("sub-rider-b");
  const riderC = await createRider("sub-rider-c");
  const today = new Date().getUTCDay();

  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderA,
    sessionType: "intervals",
    dayOfWeek: today,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderB,
    sessionType: "intervals",
    dayOfWeek: today,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderC,
    sessionType: "intervals",
    dayOfWeek: (today + 1) % 7,
    startTime: "09:00",
    durationMinutes: 60,
  });

  const occurrences = await listOccurrencesForCoach(env.DB, coach, coach);
  const occurrenceC = occurrences.find((o) => o.riderId === riderC)!;
  const fullDate = occurrences.find((o) => o.riderId === riderA)!.occurrenceDate;

  await expect(
    rescheduleOccurrence(env.DB, {
      actorId: coach,
      coachId: coach,
      occurrenceId: occurrenceC.id,
      occurrenceDate: fullDate,
      startTime: "17:00",
    }),
  ).rejects.toMatchObject({ status: 409 });
});

test("rescheduling into a coach blackout window is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 127,
    blackouts: [null, { start: "20:00", end: "23:59" }],
  });

  await expect(
    rescheduleOccurrence(env.DB, {
      actorId: coach,
      coachId: coach,
      occurrenceId: occurrence.id,
      occurrenceDate: occurrence.occurrenceDate,
      startTime: "21:00",
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("cancelling an occurrence marks it cancelled without deleting the row, and cannot be cancelled twice", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  await cancelOccurrence(env.DB, coach, coach, occurrence.id);

  const row = await env.DB.prepare(
    "SELECT status FROM session_occurrences WHERE id = ?",
  )
    .bind(occurrence.id)
    .first<{ status: string }>();
  expect(row?.status).toBe("cancelled");

  await expect(
    cancelOccurrence(env.DB, coach, coach, occurrence.id),
  ).rejects.toBeInstanceOf(ScheduleOccurrenceError);
});

test("an actor who is neither the coach nor an admin cannot reschedule or cancel an occurrence", async () => {
  const coach = await createCoach("sub-coach");
  const bystander = await createUser("sub-bystander");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  await expect(
    rescheduleOccurrence(env.DB, {
      actorId: bystander,
      coachId: coach,
      occurrenceId: occurrence.id,
      occurrenceDate: occurrence.occurrenceDate,
      startTime: "20:00",
    }),
  ).rejects.toMatchObject({ status: 403 });

  await expect(
    cancelOccurrence(env.DB, bystander, coach, occurrence.id),
  ).rejects.toMatchObject({ status: 403 });
});

test("rescheduling to a different date does not resurrect a duplicate on the original date", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);
  const originalDate = occurrence.occurrenceDate;
  const originalStartTime = occurrence.startTime;
  const newDate = addDaysIso(originalDate, 1);

  await rescheduleOccurrence(env.DB, {
    actorId: coach,
    coachId: coach,
    occurrenceId: occurrence.id,
    occurrenceDate: newDate,
    startTime: originalStartTime,
  });

  // Simulate the UI's own refresh() right after a successful reschedule,
  // which triggers ensureOccurrencesGenerated on every schedule read.
  await ensureOccurrencesGenerated(env.DB);

  const rows = await env.DB.prepare(
    `SELECT status FROM session_occurrences
     WHERE weekly_assignment_id = ? AND occurrence_date = ? AND start_time = ?`,
  )
    .bind(occurrence.weeklyAssignmentId, originalDate, originalStartTime)
    .all<{ status: string }>();

  const scheduledAtOriginal = rows.results.filter(
    (row) => row.status === "scheduled",
  );
  expect(scheduledAtOriginal).toHaveLength(0);
});

test("rescheduling onto a date the same assignment previously occupied does not 500", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);
  const dateA = occurrence.occurrenceDate;
  const dateB = addDaysIso(dateA, 1);

  const afterFirst = await rescheduleOccurrence(env.DB, {
    actorId: coach,
    coachId: coach,
    occurrenceId: occurrence.id,
    occurrenceDate: dateA,
    startTime: "17:00",
  });
  const afterSecond = await rescheduleOccurrence(env.DB, {
    actorId: coach,
    coachId: coach,
    occurrenceId: afterFirst.id,
    occurrenceDate: dateB,
    startTime: "17:00",
  });

  const afterThird = await rescheduleOccurrence(env.DB, {
    actorId: coach,
    coachId: coach,
    occurrenceId: afterSecond.id,
    occurrenceDate: dateA,
    startTime: "17:00",
  });

  expect(afterThird.status).toBe("scheduled");

  const rowsAtDateA = await env.DB.prepare(
    `SELECT status FROM session_occurrences
     WHERE weekly_assignment_id = ? AND occurrence_date = ?`,
  )
    .bind(occurrence.weeklyAssignmentId, dateA)
    .all<{ status: string }>();

  const scheduledAtDateA = rowsAtDateA.results.filter(
    (row) => row.status === "scheduled",
  );
  expect(scheduledAtDateA).toHaveLength(1);
});

test("rescheduling the series moves the weekly assignment and regenerates future occurrences on the new weekday", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  const originalDay = new Date().getUTCDay();
  const newDay = (originalDay + 2) % 7;
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: originalDay,
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);
  const newDate = addDaysIso(occurrence.occurrenceDate, (newDay - originalDay + 7) % 7);

  await rescheduleAssignmentSeries(env.DB, {
    actorId: coach,
    coachId: coach,
    occurrenceId: occurrence.id,
    occurrenceDate: newDate,
    startTime: "19:00",
  });

  const assignmentRow = await env.DB.prepare(
    "SELECT day_of_week, start_time FROM weekly_assignments WHERE id = ?",
  )
    .bind(occurrence.weeklyAssignmentId)
    .first<{ day_of_week: number; start_time: string }>();
  expect(assignmentRow?.day_of_week).toBe(newDay);
  expect(assignmentRow?.start_time).toBe("19:00");

  const occurrences = await listOccurrencesForCoach(env.DB, coach, coach);
  const scheduled = occurrences.filter((o) => o.status === "scheduled");
  expect(scheduled.length).toBeGreaterThan(0);
  for (const o of scheduled) {
    expect(new Date(`${o.occurrenceDate}T00:00:00Z`).getUTCDay()).toBe(newDay);
    expect(o.startTime).toBe("19:00");
  }
});

test("a one-off lesson has no recurring series to update", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  const occurrenceDate = addDaysIso(new Date().toISOString().slice(0, 10), 3);
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "lesson",
    dayOfWeek: 0,
    startTime: "10:00",
    durationMinutes: 60,
    occurrenceDate,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  await expect(
    rescheduleAssignmentSeries(env.DB, {
      actorId: coach,
      coachId: coach,
      occurrenceId: occurrence.id,
      occurrenceDate,
      startTime: "11:00",
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("rescheduling a series into an already-full slot is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const riderA = await createRider("sub-rider-a");
  const riderB = await createRider("sub-rider-b");
  const riderC = await createRider("sub-rider-c");
  const today = new Date().getUTCDay();
  const otherDay = (today + 1) % 7;

  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderA,
    sessionType: "intervals",
    dayOfWeek: today,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderB,
    sessionType: "intervals",
    dayOfWeek: today,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderC,
    sessionType: "intervals",
    dayOfWeek: otherDay,
    startTime: "09:00",
    durationMinutes: 60,
  });

  const occurrences = await listOccurrencesForCoach(env.DB, coach, coach);
  const occurrenceC = occurrences.find((o) => o.riderId === riderC)!;
  const fullDate = occurrences.find((o) => o.riderId === riderA)!.occurrenceDate;

  await expect(
    rescheduleAssignmentSeries(env.DB, {
      actorId: coach,
      coachId: coach,
      occurrenceId: occurrenceC.id,
      occurrenceDate: fullDate,
      startTime: "17:00",
    }),
  ).rejects.toMatchObject({ status: 409 });
});

test("an actor who is neither the coach nor an admin cannot reschedule a series", async () => {
  const coach = await createCoach("sub-coach");
  const bystander = await createUser("sub-bystander");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  await expect(
    rescheduleAssignmentSeries(env.DB, {
      actorId: bystander,
      coachId: coach,
      occurrenceId: occurrence.id,
      occurrenceDate: occurrence.occurrenceDate,
      startTime: "20:00",
    }),
  ).rejects.toMatchObject({ status: 403 });
});

test("a rider cannot cancel or restore their own occurrence — only the coach or an admin may", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  await expect(
    cancelOccurrence(env.DB, rider, coach, occurrence.id),
  ).rejects.toMatchObject({ status: 403 });

  await cancelOccurrence(env.DB, coach, coach, occurrence.id);

  await expect(
    restoreOccurrence(env.DB, rider, coach, occurrence.id),
  ).rejects.toMatchObject({ status: 403 });
});

test("the coach can cancel and restore a rider's occurrence", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  await cancelOccurrence(env.DB, coach, coach, occurrence.id);
  let row = await env.DB.prepare(
    "SELECT status FROM session_occurrences WHERE id = ?",
  )
    .bind(occurrence.id)
    .first<{ status: string }>();
  expect(row?.status).toBe("cancelled");

  await restoreOccurrence(env.DB, coach, coach, occurrence.id);
  row = await env.DB.prepare(
    "SELECT status FROM session_occurrences WHERE id = ?",
  )
    .bind(occurrence.id)
    .first<{ status: string }>();
  expect(row?.status).toBe("scheduled");
});

test("restoring into a slot the coach has since blacked out is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "21:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);
  await cancelOccurrence(env.DB, coach, coach, occurrence.id);

  // Blackout configured after the cancellation, covering the occurrence's time.
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 127,
    blackouts: [null, { start: "20:00", end: "23:59" }],
  });

  await expect(
    restoreOccurrence(env.DB, coach, coach, occurrence.id),
  ).rejects.toBeInstanceOf(BookingWindowError);
});

test("restoring into an already-full slot is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const riderA = await createRider("sub-rider-a");
  const riderB = await createRider("sub-rider-b");
  const riderC = await createRider("sub-rider-c");
  const today = new Date().getUTCDay();

  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderA,
    sessionType: "intervals",
    dayOfWeek: today,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderB,
    sessionType: "intervals",
    dayOfWeek: today,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderC,
    sessionType: "intervals",
    dayOfWeek: (today + 1) % 7,
    startTime: "09:00",
    durationMinutes: 60,
  });

  const occurrences = await listOccurrencesForCoach(env.DB, coach, coach);
  const occurrenceC = occurrences.find((o) => o.riderId === riderC)!;
  const fullDate = occurrences.find((o) => o.riderId === riderA)!.occurrenceDate;

  // Simulate occurrenceC having been cancelled at what is now a full slot.
  await env.DB.prepare(
    `UPDATE session_occurrences SET occurrence_date = ?, start_time = '17:00', status = 'cancelled'
     WHERE id = ?`,
  )
    .bind(fullDate, occurrenceC.id)
    .run();

  await expect(
    restoreOccurrence(env.DB, coach, coach, occurrenceC.id),
  ).rejects.toMatchObject({ status: 409 });
});

test("the coach can flag an occurrence as unsure without changing its status or freeing the slot", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  await setOccurrenceResponse(env.DB, coach, coach, occurrence.id, "unsure");

  const row = await env.DB.prepare(
    "SELECT status, rider_response FROM session_occurrences WHERE id = ?",
  )
    .bind(occurrence.id)
    .first<{ status: string; rider_response: string | null }>();
  expect(row?.status).toBe("scheduled");
  expect(row?.rider_response).toBe("unsure");

  await setOccurrenceResponse(env.DB, coach, coach, occurrence.id, null);
  const confirmed = await env.DB.prepare(
    "SELECT rider_response FROM session_occurrences WHERE id = ?",
  )
    .bind(occurrence.id)
    .first<{ rider_response: string | null }>();
  expect(confirmed?.rider_response).toBeNull();
});

test("setting a response is refused to the rider and to a bystander, and refused on a cancelled occurrence", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  const bystander = await createUser("sub-bystander");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  await expect(
    setOccurrenceResponse(env.DB, bystander, coach, occurrence.id, "unsure"),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    setOccurrenceResponse(env.DB, rider, coach, occurrence.id, "unsure"),
  ).rejects.toMatchObject({ status: 403 });

  await cancelOccurrence(env.DB, coach, coach, occurrence.id);

  await expect(
    setOccurrenceResponse(env.DB, coach, coach, occurrence.id, "unsure"),
  ).rejects.toMatchObject({ status: 404 });
});

test("cancelling or restoring an occurrence clears a previously set unsure flag", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);
  await setOccurrenceResponse(env.DB, coach, coach, occurrence.id, "unsure");

  await cancelOccurrence(env.DB, coach, coach, occurrence.id);
  await restoreOccurrence(env.DB, coach, coach, occurrence.id);

  const row = await env.DB.prepare(
    "SELECT rider_response FROM session_occurrences WHERE id = ?",
  )
    .bind(occurrence.id)
    .first<{ rider_response: string | null }>();
  expect(row?.rider_response).toBeNull();
});
