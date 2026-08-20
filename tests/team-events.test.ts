import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { saveCoachBookingWindows } from "@/lib/booking-windows";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import {
  createTeamEvent,
  deleteTeamEvent,
  getNextRideForUser,
  getNextRidesForUser,
  listTeamEvents,
  setTeamEventAbsence,
  TeamEventError,
} from "@/lib/team-events";
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

function futureIso(daysAhead: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

const MAPS = "https://maps.app.goo.gl/abc123";

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("a coach creates a team ride; all team riders are attendees by default", async () => {
  const coach = await createCoach();
  const rider1 = await createRider("sub-r1", "Rider One");
  const rider2 = await createRider("sub-r2", "Rider Two");
  const date = futureIso(5);

  const event = await createTeamEvent(env.DB, {
    actorId: coach,
    coachId: coach,
    eventDate: date,
    startTime: "09:00",
    finishTime: "11:30",
    locationUrl: MAPS,
  });

  expect(event.eventDate).toBe(date);
  expect(event.durationMinutes).toBe(150);
  expect(event.finishTime).toBe("11:30");
  expect(event.locationUrl).toBe(MAPS);
  expect(event.attendees.map((a) => a.id).sort()).toEqual(
    [rider1, rider2].sort(),
  );
  expect(event.absentees).toEqual([]);
});

test("a rider opts out and back in; attendees and absentees track it", async () => {
  const coach = await createCoach();
  const rider1 = await createRider("sub-r1", "Rider One");
  const rider2 = await createRider("sub-r2", "Rider Two");

  const event = await createTeamEvent(env.DB, {
    actorId: coach,
    coachId: coach,
    eventDate: futureIso(5),
    startTime: "09:00",
    finishTime: "11:00",
    locationUrl: MAPS,
  });

  await setTeamEventAbsence(env.DB, rider1, event.id, true);
  let [listed] = await listTeamEvents(env.DB);
  expect(listed.attendees.map((a) => a.id)).toEqual([rider2]);
  expect(listed.absentees.map((a) => a.id)).toEqual([rider1]);
  expect(listed.absentees[0].displayName).toBe("Rider One");

  await setTeamEventAbsence(env.DB, rider1, event.id, false);
  [listed] = await listTeamEvents(env.DB);
  expect(listed.attendees.map((a) => a.id).sort()).toEqual(
    [rider1, rider2].sort(),
  );
  expect(listed.absentees).toEqual([]);
});

test("validation: past date, finish before start, non-Maps link are rejected", async () => {
  const coach = await createCoach();
  const base = { actorId: coach, coachId: coach, locationUrl: MAPS };

  await expect(
    createTeamEvent(env.DB, {
      ...base,
      eventDate: "2020-01-01",
      startTime: "09:00",
      finishTime: "11:00",
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    createTeamEvent(env.DB, {
      ...base,
      eventDate: futureIso(5),
      startTime: "11:00",
      finishTime: "09:00",
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    createTeamEvent(env.DB, {
      ...base,
      eventDate: futureIso(5),
      startTime: "09:00",
      finishTime: "11:00",
      locationUrl: "https://example.com/not-maps",
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    createTeamEvent(env.DB, {
      ...base,
      eventDate: futureIso(5),
      startTime: "09:00",
      finishTime: "11:00",
      locationUrl: "http://maps.app.goo.gl/abc",
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("a team ride is never restricted by the coach's Intervals booking rules, even on a blacked-out day", async () => {
  const coach = await createCoach();
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 0b0111110, // Mon-Fri
    blackouts: [null, null],
  });

  // Find the next Saturday (day 6), which Intervals booking rules block.
  const date = new Date();
  while (date.getUTCDay() !== 6) date.setUTCDate(date.getUTCDate() + 1);
  const eventDate = date.toISOString().slice(0, 10);

  await expect(
    createTeamEvent(env.DB, {
      actorId: coach,
      coachId: coach,
      eventDate,
      startTime: "09:00",
      finishTime: "11:00",
      locationUrl: MAPS,
    }),
  ).resolves.toMatchObject({ eventDate });
});

test("a team ride is never restricted by a blackout window either", async () => {
  const coach = await createCoach();
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 127,
    blackouts: [null, { start: "20:00", end: "23:59" }],
  });

  await expect(
    createTeamEvent(env.DB, {
      actorId: coach,
      coachId: coach,
      eventDate: futureIso(5),
      startTime: "19:00",
      finishTime: "21:00",
      locationUrl: MAPS,
    }),
  ).resolves.toMatchObject({ startTime: "19:00" });
});

test("deleting a team ride removes it and its absences", async () => {
  const coach = await createCoach();
  const rider = await createRider("sub-r1", "Rider One");
  const event = await createTeamEvent(env.DB, {
    actorId: coach,
    coachId: coach,
    eventDate: futureIso(5),
    startTime: "09:00",
    finishTime: "11:00",
    locationUrl: MAPS,
  });
  await setTeamEventAbsence(env.DB, rider, event.id, true);

  await deleteTeamEvent(env.DB, coach, coach, event.id);

  expect(await listTeamEvents(env.DB)).toEqual([]);
  const absences = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM team_event_absences WHERE event_id = ?",
  )
    .bind(event.id)
    .first<{ n: number }>();
  expect(absences?.n).toBe(0);
});

test("getNextRideForUser returns the earliest of own sessions and team rides", async () => {
  const coach = await createCoach();
  const rider = await createRider("sub-r1", "Rider One");

  // Nothing scheduled yet.
  expect(await getNextRideForUser(env.DB, rider)).toBeNull();

  // A team ride in 6 days is the next thing.
  await createTeamEvent(env.DB, {
    actorId: coach,
    coachId: coach,
    eventDate: futureIso(6),
    startTime: "09:00",
    finishTime: "11:00",
    locationUrl: MAPS,
  });
  expect(await getNextRideForUser(env.DB, rider)).toEqual({
    label: "Practice Ride",
    eventDate: futureIso(6),
    startTime: "09:00",
  });

  // An intervals occurrence before the team ride wins.
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });
  const next = await getNextRideForUser(env.DB, rider);
  expect(next?.label).toBe("Intervals");
  expect(next?.startTime).toBe("17:00");
  expect(
    `${next?.eventDate}T${next?.startTime}` < `${futureIso(6)}T09:00`,
  ).toBe(true);

  // Another rider with no sessions still sees the team ride as next.
  const other = await createRider("sub-r2", "Rider Two");
  expect((await getNextRideForUser(env.DB, other))?.label).toBe(
    "Practice Ride",
  );
});

test("getNextRidesForUser merges up to three items, earliest first", async () => {
  const coach = await createCoach();
  const rider = await createRider("sub-r1", "Rider One");

  await createTeamEvent(env.DB, {
    actorId: coach,
    coachId: coach,
    eventDate: futureIso(6),
    startTime: "09:00",
    finishTime: "11:00",
    locationUrl: MAPS,
  });
  await createTeamEvent(env.DB, {
    actorId: coach,
    coachId: coach,
    eventDate: futureIso(9),
    startTime: "08:00",
    finishTime: "10:00",
    locationUrl: MAPS,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  const rides = await getNextRidesForUser(env.DB, rider);
  expect(rides.length).toBe(3);
  const keys = rides.map((ride) => `${ride.eventDate}T${ride.startTime}`);
  expect([...keys].sort()).toEqual(keys);
  expect(rides[0].label).toBe("Intervals");
  expect(rides.some((ride) => ride.label === "Practice Ride")).toBe(true);

  expect(await getNextRidesForUser(env.DB, await createRider("sub-r2", "Rider Two"))).toHaveLength(2);
});

test("a non-team account cannot RSVP, and RSVP to a missing event 404s", async () => {
  const coach = await createCoach();
  const member = await createUser("sub-member", "Member Mia");
  await grantDefaultPersona(env.DB, member);
  const event = await createTeamEvent(env.DB, {
    actorId: coach,
    coachId: coach,
    eventDate: futureIso(5),
    startTime: "09:00",
    finishTime: "11:00",
    locationUrl: MAPS,
  });

  await expect(
    setTeamEventAbsence(env.DB, member, event.id, true),
  ).rejects.toBeInstanceOf(TeamEventError);
  const rider = await createRider("sub-r1", "Rider One");
  await expect(
    setTeamEventAbsence(env.DB, rider, 9999, true),
  ).rejects.toMatchObject({ status: 404 });
});
