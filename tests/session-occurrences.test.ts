import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import { createWeeklyAssignment } from "@/lib/weekly-assignments";
import {
  ScheduleOccurrenceError,
  cancelOccurrence,
  ensureOccurrencesGenerated,
  listOccurrencesForCoach,
  listOccurrencesForRider,
  rescheduleOccurrence,
} from "@/lib/session-occurrences";

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
