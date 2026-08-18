import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/image", async () => {
  const { createElement: createImageElement } = await import("react");
  return {
    default: ({ fill: _fill, ...props }: Record<string, unknown>) => {
      void _fill;
      return createImageElement("img", props);
    },
  };
});

import ReviewQueue from "@/app/admin/profiles/ReviewQueue";
import type { PendingProfile } from "@/lib/profile-review";

test("the review queue presents profile content, socials, feedback, and decisions", () => {
  const profile: PendingProfile = {
    userId: 42,
    slug: "trail-coach",
    displayName: "Trail Coach",
    bio: "A coach bio",
    imageUrl: `/api/profiles/image/${"a".repeat(64)}`,
    imagePosition: "center 38%",
    socials: {
      instagram: "https://instagram.com/trailcoach",
      website: "https://trailcoach.example",
    },
    sponsors: [{ name: "Trail Snacks Co", url: null }],
    personas: ["coach", "member"],
    submittedAt: "2026-08-18 02:00:37",
  };

  const html = renderToStaticMarkup(
    createElement(ReviewQueue, { initialProfiles: [profile] }),
  );

  expect(html).toContain("Trail Coach");
  expect(html).toContain("A coach bio");
  expect(html).toContain("Coach");
  expect(html).toContain("instagram.com/trailcoach");
  expect(html).toContain("Sponsors");
  expect(html).toContain("Trail Snacks Co");
  expect(html).toContain("object-position:center 38%");
  expect(html).toContain("Approve");
  expect(html).toContain("Reject");
  expect(html).toContain('name="review-note-42"');
});

test("an empty review queue has a clear completion state", () => {
  const html = renderToStaticMarkup(
    createElement(ReviewQueue, { initialProfiles: [] }),
  );

  expect(html).toContain("No profiles are waiting for review");
});
