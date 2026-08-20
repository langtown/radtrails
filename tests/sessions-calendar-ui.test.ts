import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import SessionsCalendar from "@/components/SessionsCalendar";
import type { SessionOccurrence } from "@/lib/session-occurrences";

const SESSION: SessionOccurrence = {
  id: 1,
  weeklyAssignmentId: 1,
  coachId: 10,
  riderId: 20,
  coachDisplayName: "Coach Carol",
  riderDisplayName: "Alice Rider",
  riderPlaylistUrl: null,
  sessionType: "intervals",
  occurrenceDate: "2026-08-25",
  startTime: "17:00",
  durationMinutes: 60,
  status: "scheduled",
  riderResponse: null,
  notes: null,
};

test("the sessions calendar renders its section even with no sessions", () => {
  const empty = renderToStaticMarkup(
    createElement(SessionsCalendar, { sessions: [], perspective: "coach" }),
  );
  expect(empty).toContain("Your sessions");

  const withSession = renderToStaticMarkup(
    createElement(SessionsCalendar, {
      sessions: [SESSION],
      perspective: "coach",
    }),
  );
  expect(withSession).toContain("Your sessions");
});
