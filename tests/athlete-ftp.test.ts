import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { FtpZoneError, getFtpZones, setFtpZones } from "@/lib/athlete-ftp";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import { createWeeklyAssignment } from "@/lib/weekly-assignments";

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

const ZONES = { z1Watts: 100, z2Watts: 140, z3Watts: 170, z4Watts: 200, z5Watts: 240 };

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("a coach can set and read FTP zones for a rider they actively coach", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  await setFtpZones(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    ...ZONES,
  });

  const zones = await getFtpZones(env.DB, coach, coach, rider, "intervals");
  expect(zones).toMatchObject({ z1Watts: 100, z5Watts: 240 });
});

test("setting FTP zones without an active assignment is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");

  await expect(
    setFtpZones(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: rider,
      sessionType: "intervals",
      ...ZONES,
    }),
  ).rejects.toMatchObject({ status: 409 });
});

test("an invalid watt value is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  await expect(
    setFtpZones(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: rider,
      sessionType: "intervals",
      ...ZONES,
      z1Watts: 0,
    }),
  ).rejects.toBeInstanceOf(FtpZoneError);
});

test("reading zones for a rider with none set yet returns nulls, not an error", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");

  const zones = await getFtpZones(env.DB, coach, coach, rider, "intervals");
  expect(zones.z1Watts).toBeNull();
});

test("a different coach cannot set zones for a rider they do not coach", async () => {
  const coachA = await createCoach("sub-coach-a");
  const coachB = await createCoach("sub-coach-b");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coachA,
    coachId: coachA,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  await expect(
    setFtpZones(env.DB, {
      actorId: coachB,
      coachId: coachB,
      riderId: rider,
      sessionType: "intervals",
      ...ZONES,
    }),
  ).rejects.toMatchObject({ status: 409 });
});

test("an actor who is neither the coach nor an admin cannot read or set FTP zones", async () => {
  const coach = await createCoach("sub-coach");
  const bystander = await createUser("sub-bystander");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  await expect(
    getFtpZones(env.DB, bystander, coach, rider, "intervals"),
  ).rejects.toMatchObject({ status: 403 });

  await expect(
    setFtpZones(env.DB, {
      actorId: bystander,
      coachId: coach,
      riderId: rider,
      sessionType: "intervals",
      ...ZONES,
    }),
  ).rejects.toMatchObject({ status: 403 });
});
