import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import {
  deriveZonesFromZone5,
  FtpError,
  getPowerForCoach,
  getRiderPower,
  setPower,
} from "@/lib/athlete-ftp";
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

async function assign(coach: number, rider: number) {
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("deriveZonesFromZone5 reverse-engineers FTP and all seven Coggan zones", () => {
  // The reference example: Zone 5 = 226W -> FTP = 200W.
  const { ftpWatts, zones } = deriveZonesFromZone5(226);
  expect(ftpWatts).toBe(200);
  expect(zones).toEqual([
    { zone: "Z1", label: "Active Recovery", minWatts: null, maxWatts: 110 },
    { zone: "Z2", label: "Endurance", minWatts: 112, maxWatts: 150 },
    { zone: "Z3", label: "Tempo", minWatts: 152, maxWatts: 180 },
    { zone: "Z4", label: "Lactate Threshold", minWatts: 182, maxWatts: 210 },
    { zone: "Z5", label: "VO2 Max", minWatts: 212, maxWatts: 240 },
    { zone: "Z6", label: "Anaerobic Capacity", minWatts: 242, maxWatts: 300 },
    { zone: "Z7", label: "Neuromuscular Power", minWatts: 302, maxWatts: null },
  ]);
});

test("a coach can set and read a rider's Zone 5 power", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await assign(coach, rider);

  await setPower(env.DB, { actorId: coach, coachId: coach, riderId: rider, zone5Watts: 226 });

  const power = await getPowerForCoach(env.DB, coach, coach, rider);
  expect(power.zone5Watts).toBe(226);
  expect(power.updatedAt).not.toBeNull();

  // The rider sees the same value on their own profile read.
  expect((await getRiderPower(env.DB, rider)).zone5Watts).toBe(226);
});

test("setting power again replaces the value, not adds a row", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await assign(coach, rider);

  await setPower(env.DB, { actorId: coach, coachId: coach, riderId: rider, zone5Watts: 220 });
  await setPower(env.DB, { actorId: coach, coachId: coach, riderId: rider, zone5Watts: 230 });

  expect((await getRiderPower(env.DB, rider)).zone5Watts).toBe(230);
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM athlete_ftp WHERE user_id = ?",
  )
    .bind(rider)
    .first<{ n: number }>();
  expect(count?.n).toBe(1);
});

test("a rider with no power row reads null watts", async () => {
  const rider = await createRider("sub-rider");
  const power = await getRiderPower(env.DB, rider);
  expect(power.zone5Watts).toBeNull();
  expect(power.updatedAt).toBeNull();
});

test("setting power without an active assignment is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");

  await expect(
    setPower(env.DB, { actorId: coach, coachId: coach, riderId: rider, zone5Watts: 226 }),
  ).rejects.toBeInstanceOf(FtpError);
});

test("an unrelated coach cannot read or set the rider's power", async () => {
  const coach = await createCoach("sub-coach");
  const otherCoach = await createCoach("sub-other-coach");
  const rider = await createRider("sub-rider");
  await assign(coach, rider);

  await expect(getPowerForCoach(env.DB, otherCoach, otherCoach, rider)).rejects.toBeInstanceOf(
    FtpError,
  );
  await expect(
    setPower(env.DB, {
      actorId: otherCoach,
      coachId: otherCoach,
      riderId: rider,
      zone5Watts: 226,
    }),
  ).rejects.toBeInstanceOf(FtpError);
});

test("Zone 5 power must be a whole watt value in range", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await assign(coach, rider);

  for (const bad of [0, -5, 3001, 199.5]) {
    await expect(
      setPower(env.DB, { actorId: coach, coachId: coach, riderId: rider, zone5Watts: bad }),
    ).rejects.toMatchObject({ status: 400 });
  }
});
