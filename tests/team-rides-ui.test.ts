import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import TeamRides, { type TeamRideWithRsvp } from "@/app/profile/TeamRides";

const RIDE: TeamRideWithRsvp = {
  id: 1,
  coachId: 10,
  coachDisplayName: "Coach Carla",
  eventDate: "2026-08-25",
  startTime: "09:00",
  durationMinutes: 120,
  finishTime: "11:00",
  locationUrl: "https://maps.app.goo.gl/abc123",
  info: null,
  attendees: [
    { id: 20, displayName: "Alice Rider" },
    { id: 21, displayName: "Bob Rider" },
  ],
  absentees: [{ id: 22, displayName: "Cara Rider" }],
  viewerUnavailable: false,
};

test("shows the names of who is attending and who is not available", () => {
  const html = renderToStaticMarkup(
    createElement(TeamRides, { initialRides: [RIDE], canRsvp: true }),
  );

  expect(html).toContain("Alice Rider");
  expect(html).toContain("Bob Rider");
  expect(html).toContain("Cara Rider");
});

test("a rider who can RSVP sees the not-available toggle", () => {
  const html = renderToStaticMarkup(
    createElement(TeamRides, { initialRides: [RIDE], canRsvp: true }),
  );

  expect(html).toContain("Not available");
});

test("a viewer who cannot RSVP sees a read-only list with no toggle", () => {
  const html = renderToStaticMarkup(
    createElement(TeamRides, { initialRides: [RIDE], canRsvp: false }),
  );

  expect(html).not.toContain("Not available");
  expect(html).not.toContain("Back in");
  expect(html).toContain("Alice Rider");
});
