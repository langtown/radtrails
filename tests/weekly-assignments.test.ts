import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import {
  ScheduleAssignmentError,
  createWeeklyAssignment,
  deactivateWeeklyAssignment,
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
  ).rejects.toMatchObject({ status: 409 });
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
