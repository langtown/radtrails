import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import MySessions from "@/app/profile/MySessions";
import PlaylistEditor from "@/app/profile/PlaylistEditor";
import type { SessionOccurrence } from "@/lib/session-occurrences";

test("the playlist editor shows the saved link", () => {
  const html = renderToStaticMarkup(
    createElement(PlaylistEditor, {
      initialPlaylistUrl: "https://open.spotify.com/playlist/abc",
    }),
  );

  expect(html).toContain("Session playlist");
  expect(html).toContain('value="https://open.spotify.com/playlist/abc"');
  expect(html).toContain("Save playlist");
});

test("my sessions lists only scheduled occurrences and renders nothing when there are none", () => {
  const scheduled: SessionOccurrence = {
    id: 1,
    weeklyAssignmentId: 1,
    coachId: 10,
    riderId: 20,
    riderDisplayName: null,
    riderPlaylistUrl: null,
    sessionType: "intervals",
    occurrenceDate: "2026-08-25",
    startTime: "17:00",
    durationMinutes: 60,
    status: "scheduled",
    notes: null,
  };
  const cancelled: SessionOccurrence = { ...scheduled, id: 2, status: "cancelled" };

  const withSessions = renderToStaticMarkup(
    createElement(MySessions, { sessions: [scheduled, cancelled] }),
  );
  expect(withSessions).toContain("2026-08-25");

  const empty = renderToStaticMarkup(
    createElement(MySessions, { sessions: [cancelled] }),
  );
  expect(empty).toBe("");
});
