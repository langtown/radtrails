import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import {
  BookingWindowError,
  assertBookable,
  getCoachBookingWindows,
  parseBlackoutInput,
  saveCoachBookingWindows,
} from "@/lib/booking-windows";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, display_name) VALUES (?, ?) RETURNING id",
  )
    .bind(googleSub, googleSub)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");
  return row.id;
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

async function createAdmin(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'admin')",
  )
    .bind(id)
    .run();
  return id;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("an unconfigured coach has no booking windows and every day/time is bookable", async () => {
  const coach = await createCoach("sub-coach");

  expect(await getCoachBookingWindows(env.DB, coach, "intervals")).toBeNull();
  await expect(
    assertBookable(env.DB, coach, "intervals", 0, "03:00", 60),
  ).resolves.toBeUndefined();
});

test("a coach saves allowed days and blackout windows for a session type", async () => {
  const coach = await createCoach("sub-coach");

  const saved = await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 0b0111110, // Mon-Fri
    blackouts: [
      { start: "00:00", end: "06:00" },
      { start: "20:00", end: "23:59" },
    ],
  });

  expect(saved.allowedDaysMask).toBe(0b0111110);
  expect(saved.blackouts).toEqual([
    { start: "00:00", end: "06:00" },
    { start: "20:00", end: "23:59" },
  ]);

  const reloaded = await getCoachBookingWindows(env.DB, coach, "intervals");
  expect(reloaded).toEqual(saved);
});

test("intervals and lesson rules are independent for the same coach", async () => {
  const coach = await createCoach("sub-coach");

  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 0b0111110, // Mon-Fri
    blackouts: [null, null],
  });
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "lesson",
    allowedDaysMask: 0b0000001, // Sunday only
    blackouts: [null, null],
  });

  expect(
    (await getCoachBookingWindows(env.DB, coach, "intervals"))?.allowedDaysMask,
  ).toBe(0b0111110);
  expect(
    (await getCoachBookingWindows(env.DB, coach, "lesson"))?.allowedDaysMask,
  ).toBe(0b0000001);
});

test("saving again overwrites the previous configuration for that session type", async () => {
  const coach = await createCoach("sub-coach");
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 127,
    blackouts: [{ start: "00:00", end: "06:00" }, null],
  });

  const resaved = await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 0b0000001, // Sunday only
    blackouts: [null, null],
  });

  expect(resaved.allowedDaysMask).toBe(0b0000001);
  expect(resaved.blackouts).toEqual([]);
  expect(await getCoachBookingWindows(env.DB, coach, "intervals")).toEqual(
    resaved,
  );
});

test("an admin may save booking windows for a coach", async () => {
  const coach = await createCoach("sub-coach");
  const admin = await createAdmin("sub-admin");

  await expect(
    saveCoachBookingWindows(env.DB, {
      actorId: admin,
      coachId: coach,
      sessionType: "intervals",
      allowedDaysMask: 127,
      blackouts: [null, null],
    }),
  ).resolves.toMatchObject({ allowedDaysMask: 127 });
});

test("a non-coach, non-admin actor cannot save booking windows", async () => {
  const coach = await createCoach("sub-coach");
  const other = await createUser("sub-other");

  await expect(
    saveCoachBookingWindows(env.DB, {
      actorId: other,
      coachId: coach,
      sessionType: "intervals",
      allowedDaysMask: 127,
      blackouts: [null, null],
    }),
  ).rejects.toMatchObject({ status: 403 });
});

test("validation: mask must allow at least one day", async () => {
  const coach = await createCoach("sub-coach");

  await expect(
    saveCoachBookingWindows(env.DB, {
      actorId: coach,
      coachId: coach,
      sessionType: "intervals",
      allowedDaysMask: 0,
      blackouts: [null, null],
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("validation: a blackout window's start must be before its end", async () => {
  const coach = await createCoach("sub-coach");

  await expect(
    saveCoachBookingWindows(env.DB, {
      actorId: coach,
      coachId: coach,
      sessionType: "intervals",
      allowedDaysMask: 127,
      blackouts: [{ start: "10:00", end: "09:00" }, null],
    }),
  ).rejects.toBeInstanceOf(BookingWindowError);
});

test("validation: blackout times must be HH:MM", async () => {
  const coach = await createCoach("sub-coach");

  await expect(
    saveCoachBookingWindows(env.DB, {
      actorId: coach,
      coachId: coach,
      sessionType: "intervals",
      allowedDaysMask: 127,
      blackouts: [{ start: "9am", end: "10:00" }, null],
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("assertBookable rejects a day outside the allowed mask", async () => {
  const coach = await createCoach("sub-coach");
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 0b0111110, // Mon-Fri
    blackouts: [null, null],
  });

  await expect(
    assertBookable(env.DB, coach, "intervals", 0, "17:00", 60), // Sunday
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    assertBookable(env.DB, coach, "intervals", 3, "17:00", 60), // Wednesday
  ).resolves.toBeUndefined();
});

test("assertBookable rejects a start time inside a blackout window", async () => {
  const coach = await createCoach("sub-coach");
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 127,
    blackouts: [
      { start: "00:00", end: "06:00" },
      { start: "20:00", end: "23:59" },
    ],
  });

  await expect(
    assertBookable(env.DB, coach, "intervals", 2, "03:00", 60),
  ).rejects.toBeInstanceOf(BookingWindowError);
  await expect(
    assertBookable(env.DB, coach, "intervals", 2, "21:00", 30),
  ).rejects.toBeInstanceOf(BookingWindowError);
});

test("assertBookable rejects a session whose duration spills into a blackout window", async () => {
  const coach = await createCoach("sub-coach");
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 127,
    blackouts: [null, { start: "20:00", end: "23:59" }],
  });

  await expect(
    assertBookable(env.DB, coach, "intervals", 2, "19:30", 60), // 19:30-20:30
  ).rejects.toBeInstanceOf(BookingWindowError);
});

test("assertBookable allows a session that exactly abuts a blackout boundary", async () => {
  const coach = await createCoach("sub-coach");
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 127,
    blackouts: [
      { start: "00:00", end: "06:00" },
      { start: "20:00", end: "23:59" },
    ],
  });

  await expect(
    assertBookable(env.DB, coach, "intervals", 2, "06:00", 60),
  ).resolves.toBeUndefined();
  await expect(
    assertBookable(env.DB, coach, "intervals", 2, "18:00", 120), // ends exactly 20:00
  ).resolves.toBeUndefined();
});

test("assertBookable never restricts practice rides, even with strict intervals rules configured", async () => {
  const coach = await createCoach("sub-coach");
  await saveCoachBookingWindows(env.DB, {
    actorId: coach,
    coachId: coach,
    sessionType: "intervals",
    allowedDaysMask: 0b0000001, // Sunday only
    blackouts: [{ start: "00:00", end: "23:59" }, null],
  });

  await expect(
    assertBookable(env.DB, coach, "practiceride", 3, "12:00", 60),
  ).resolves.toBeUndefined();
});

test("parseBlackoutInput accepts null/undefined and well-shaped windows, and rejects malformed ones", () => {
  expect(parseBlackoutInput(null)).toBeNull();
  expect(parseBlackoutInput(undefined)).toBeNull();
  expect(parseBlackoutInput({ start: "00:00", end: "06:00" })).toEqual({
    start: "00:00",
    end: "06:00",
  });

  expect(() => parseBlackoutInput("00:00-06:00")).toThrow(BookingWindowError);
  expect(() => parseBlackoutInput({ start: "00:00" })).toThrow(
    BookingWindowError,
  );
  expect(() => parseBlackoutInput({ start: 0, end: "06:00" })).toThrow(
    BookingWindowError,
  );
});
