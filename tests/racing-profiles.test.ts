import { createElement } from "react";
import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/image", () => ({
  default: ({
    fill: _fill,
    unoptimized: _unoptimized,
    priority: _priority,
    ...props
  }: Record<string, unknown>) => {
    void _fill;
    void _unoptimized;
    void _priority;
    return createElement("img", props);
  },
}));

import RacerGrid from "@/components/RacerGrid";
import { racers } from "@/lib/content/racing";
import type { PublicProfile } from "@/lib/public-profiles";
import { buildRacingTeam } from "@/lib/racing-profiles";

test("approved team profiles append without replacing checked-in racers", () => {
  const originalBio = racers[1].bio;
  const approved: PublicProfile[] = [
    {
      slug: "new-team-rider",
      name: "New Team Rider",
      image: "/api/profiles/image/abc",
      bio: "Approved rider biography",
      imagePosition: "center 30%",
      socials: {
        instagram: "https://instagram.com/newteamrider",
        strava: "https://strava.com/athletes/123",
      },
      sponsors: ["Rad Bikes", "Trail Snacks Co"],
    },
    {
      slug: "bobby-duplicate",
      name: "  BOBBY   LANGIN ",
      image: null,
      bio: "A duplicate of the checked-in featured racer",
      imagePosition: null,
      socials: {},
      sponsors: [],
    },
  ];

  const team = buildRacingTeam(racers, approved);

  expect(team).toHaveLength(racers.length);
  expect(team.filter((racer) => racer.name.trim().toLowerCase() === "bobby langin"))
    .toHaveLength(0);
  expect(team.find((racer) => racer.name === racers[1].name)?.bio).toBe(
    originalBio,
  );
  expect(team.find((racer) => racer.name === "New Team Rider")).toMatchObject({
    bio: "Approved rider biography",
    socials: {
      instagram: "https://instagram.com/newteamrider",
      strava: "https://strava.com/athletes/123",
    },
    sponsors: ["Rad Bikes", "Trail Snacks Co"],
  });

  const html = renderToStaticMarkup(RacerGrid({ racers: team }));
  expect(html).toContain("New Team Rider");
  expect(html).toContain("Sponsors");
  expect(html).toContain("Rad Bikes");
  expect(html).toContain("Trail Snacks Co");
  expect(html).toContain("Socials");
  expect(html).toContain('href="https://instagram.com/newteamrider"');
  expect(html).toContain('href="https://strava.com/athletes/123"');
  expect(html).toContain("Instagram");
  expect(html).toContain("Strava");
  expect(html).not.toContain("X / Twitter");
  // Each social link is prefixed with its brand glyph.
  expect(html.indexOf("<svg")).toBeGreaterThan(-1);
});
