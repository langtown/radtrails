import { expect, test } from "vitest";
import {
  MAX_RIDERS_PER_SLOT,
  OCCURRENCE_WINDOW_WEEKS,
  SESSION_TYPES,
  isValidDayOfWeek,
  isValidDurationMinutes,
  isValidFtpWatts,
  isValidIsoDate,
  isValidSessionType,
  isValidTimeOfDay,
} from "@/lib/coaching-constraints";

test("session types include intervals and nothing else yet", () => {
  expect(SESSION_TYPES).toEqual(["intervals"]);
  expect(isValidSessionType("intervals")).toBe(true);
  expect(isValidSessionType("private_lessons")).toBe(false);
  expect(isValidSessionType(42)).toBe(false);
});

test("day of week accepts 0-6 only", () => {
  expect(isValidDayOfWeek(0)).toBe(true);
  expect(isValidDayOfWeek(6)).toBe(true);
  expect(isValidDayOfWeek(7)).toBe(false);
  expect(isValidDayOfWeek(-1)).toBe(false);
  expect(isValidDayOfWeek(1.5)).toBe(false);
  expect(isValidDayOfWeek("1")).toBe(false);
});

test("time of day requires 24-hour HH:MM", () => {
  expect(isValidTimeOfDay("09:00")).toBe(true);
  expect(isValidTimeOfDay("23:59")).toBe(true);
  expect(isValidTimeOfDay("24:00")).toBe(false);
  expect(isValidTimeOfDay("9:00")).toBe(false);
  expect(isValidTimeOfDay("09:00:00")).toBe(false);
});

test("duration is a positive integer capped at 240 minutes", () => {
  expect(isValidDurationMinutes(60)).toBe(true);
  expect(isValidDurationMinutes(240)).toBe(true);
  expect(isValidDurationMinutes(0)).toBe(false);
  expect(isValidDurationMinutes(241)).toBe(false);
  expect(isValidDurationMinutes(60.5)).toBe(false);
});

test("iso dates must be real calendar dates in YYYY-MM-DD form", () => {
  expect(isValidIsoDate("2026-08-18")).toBe(true);
  expect(isValidIsoDate("2026-02-30")).toBe(false);
  expect(isValidIsoDate("08-18-2026")).toBe(false);
  expect(isValidIsoDate("2026-8-18")).toBe(false);
});

test("FTP watts must be a positive integer within range", () => {
  expect(isValidFtpWatts(200)).toBe(true);
  expect(isValidFtpWatts(0)).toBe(false);
  expect(isValidFtpWatts(3001)).toBe(false);
  expect(isValidFtpWatts(200.5)).toBe(false);
});

test("the rolling generation window and per-slot cap match the design", () => {
  expect(OCCURRENCE_WINDOW_WEEKS).toBe(8);
  expect(MAX_RIDERS_PER_SLOT).toBe(2);
});
