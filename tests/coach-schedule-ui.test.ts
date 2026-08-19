import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import CoachScheduleManager from "@/app/coach/CoachScheduleManager";
import type { SessionOccurrence } from "@/lib/session-occurrences";
import type { WeeklyAssignment } from "@/lib/weekly-assignments";

const ASSIGNMENT: WeeklyAssignment = {
  id: 1,
  coachId: 10,
  riderId: 20,
  riderDisplayName: "Alice Rider",
  sessionType: "intervals",
  dayOfWeek: 2,
  startTime: "17:00",
  durationMinutes: 60,
};

const OCCURRENCE: SessionOccurrence = {
  id: 100,
  weeklyAssignmentId: 1,
  coachId: 10,
  riderId: 20,
  riderDisplayName: "Alice Rider",
  riderPlaylistUrl: "https://open.spotify.com/playlist/abc",
  sessionType: "intervals",
  occurrenceDate: "2026-08-25",
  startTime: "17:00",
  durationMinutes: 60,
  status: "scheduled",
  notes: null,
};

test("shows the weekly assignment, the add-rider form, and upcoming sessions with a playlist link", () => {
  const html = renderToStaticMarkup(
    createElement(CoachScheduleManager, {
      coachId: 10,
      initialAssignments: [ASSIGNMENT],
      initialOccurrences: [OCCURRENCE],
      eligibleRiders: [{ id: 20, displayName: "Alice Rider" }],
    }),
  );

  expect(html).toContain("Alice Rider");
  expect(html).toContain("Tuesday");
  expect(html).toContain("Add to calendar");
  expect(html).toContain("2026-08-25");
  expect(html).toContain('href="https://open.spotify.com/playlist/abc"');
  expect(html).toContain("Cancel this date");
  expect(html).toContain("Reschedule");
});

test("shows an empty state when there is nothing scheduled yet", () => {
  const html = renderToStaticMarkup(
    createElement(CoachScheduleManager, {
      coachId: 10,
      initialAssignments: [],
      initialOccurrences: [],
      eligibleRiders: [],
    }),
  );

  expect(html).toContain("No riders scheduled yet.");
  expect(html).toContain("No upcoming sessions.");
});
