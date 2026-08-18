import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/image", async () => {
  const { createElement: createImageElement } = await import("react");

  return {
    default: ({
      unoptimized: _unoptimized,
      fill: _fill,
      ...props
    }: Record<string, unknown>) => {
      void _unoptimized;
      void _fill;
      return createImageElement("img", props);
    },
  };
});

import {
  ProfileEditor,
  buildProfilePayload,
  validateProfileImageFile,
} from "@/app/profile/ProfileEditor";
import {
  MAX_PROFILE_IMAGE_BYTES,
  canEditSocialLinks,
  parseImagePosition,
} from "@/lib/profile-constraints";
import type { OwnProfile } from "@/lib/profiles";

const PROFILE: OwnProfile = {
  slug: "trail-rider",
  displayName: "Trail Rider",
  bio: "Loves technical trails.",
  imageKey: "a".repeat(64),
  imageUrl: `/api/profiles/image/${"a".repeat(64)}`,
  imagePosition: "center 32%",
  socials: {
    instagram: "https://www.instagram.com/trailrider/",
    twitter: "https://x.com/trailrider",
  },
  status: "pending",
  submittedAt: "2026-08-18 02:00:37",
  reviewedAt: null,
  reviewNote: null,
};

function render(canEditSocials: boolean, profile: OwnProfile | null = PROFILE) {
  return renderToStaticMarkup(
    createElement(ProfileEditor, {
      initialDisplayName: "Google Name",
      initialProfile: profile,
      canEditSocials,
    }),
  );
}

test("the editor includes profile fields, the image limit, crop preview, and review status", () => {
  const html = render(false);

  expect(html).toContain("Profile details");
  expect(html).toContain('name="displayName"');
  expect(html).toContain('name="bio"');
  expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
  expect(html).toContain("JPEG, PNG, or WebP up to 1 MB");
  expect(html).toContain("Pending review");
  expect(html).toContain("object-position:50% 32%");
  expect(html).toContain('value="Trail Rider"');
  expect(html).toContain("Loves technical trails.");
});

test("member-only accounts do not see editable social fields", () => {
  const html = render(false);

  expect(html).not.toContain(">Social links</h3>");
  expect(html).not.toContain('name="social-instagram"');
  expect(html).toContain(
    "Social links are available when an admin adds a team, coach, alumni, or admin persona.",
  );
});

test("any non-member persona enables all supported social fields", () => {
  expect(canEditSocialLinks(["member"])).toBe(false);
  expect(canEditSocialLinks(["member", "coach"])).toBe(true);
  expect(canEditSocialLinks(["admin"])).toBe(true);

  const html = render(true);
  expect(html).toContain("Social links");
  for (const platform of [
    "instagram",
    "tiktok",
    "twitter",
    "youtube",
    "facebook",
    "strava",
    "website",
  ]) {
    expect(html).toContain(`name="social-${platform}"`);
  }
  expect(html).toContain(
    'value="https://www.instagram.com/trailrider/"',
  );
});

test("new profiles start with the Google display name and no published status", () => {
  const html = render(true, null);

  expect(html).toContain('value="Google Name"');
  expect(html).toContain("Not submitted");
});

test("a rejected profile shows the admin feedback to its owner", () => {
  const html = render(false, {
    ...PROFILE,
    status: "rejected",
    reviewNote: "Please use a clearer headshot.",
  });

  expect(html).toContain("Changes requested");
  expect(html).toContain("Reviewer feedback");
  expect(html).toContain("Please use a clearer headshot.");
});

test("profile payloads include social fields only for eligible accounts", () => {
  const data = new FormData();
  data.set("displayName", "Trail Rider");
  data.set("bio", "A bio");
  data.set("cropY", "42");
  data.set("social-instagram", "https://instagram.com/trailrider");
  data.set("social-tiktok", "");

  expect(buildProfilePayload(data, null, false)).toEqual({
    displayName: "Trail Rider",
    bio: "A bio",
    imageKey: null,
    imagePosition: null,
    socials: {},
  });
  expect(buildProfilePayload(data, "b".repeat(64), true)).toEqual({
    displayName: "Trail Rider",
    bio: "A bio",
    imageKey: "b".repeat(64),
    imagePosition: "50% 42%",
    socials: {
      instagram: "https://instagram.com/trailrider",
    },
  });
});

test("profile payloads keep a 0% crop focus and only default when missing", () => {
  const data = new FormData();
  data.set("displayName", "Trail Rider");
  data.set("cropY", "0");
  expect(
    buildProfilePayload(data, "b".repeat(64), false).imagePosition,
  ).toBe("50% 0%");

  data.set("cropY", "not-a-number");
  expect(
    buildProfilePayload(data, "b".repeat(64), false).imagePosition,
  ).toBe("50% 50%");

  data.delete("cropY");
  expect(
    buildProfilePayload(data, "b".repeat(64), false).imagePosition,
  ).toBe("50% 50%");

  data.set("cropY", "140");
  expect(
    buildProfilePayload(data, "b".repeat(64), false).imagePosition,
  ).toBe("50% 100%");
});

test("profile payloads carry the horizontal crop focus for wide photos", () => {
  const data = new FormData();
  data.set("displayName", "Trail Rider");
  data.set("cropX", "20");
  data.set("cropY", "80");
  expect(
    buildProfilePayload(data, "b".repeat(64), false).imagePosition,
  ).toBe("20% 80%");

  data.set("cropX", "0");
  expect(
    buildProfilePayload(data, "b".repeat(64), false).imagePosition,
  ).toBe("0% 80%");
});

test("parseImagePosition reads stored positions into slider values", () => {
  expect(parseImagePosition(null)).toEqual({ x: 50, y: 50 });
  expect(parseImagePosition("center 32%")).toEqual({ x: 50, y: 32 });
  expect(parseImagePosition("20% 80%")).toEqual({ x: 20, y: 80 });
  expect(parseImagePosition("0% 100%")).toEqual({ x: 0, y: 100 });
  expect(parseImagePosition("left top")).toEqual({ x: 0, y: 0 });
  expect(parseImagePosition("center")).toEqual({ x: 50, y: 50 });
  expect(parseImagePosition("nonsense")).toEqual({ x: 50, y: 50 });
});

test("image selection enforces the same type and size contract as the API", () => {
  expect(
    validateProfileImageFile({ size: 512_000, type: "image/webp" }),
  ).toBeNull();
  expect(
    validateProfileImageFile({
      size: MAX_PROFILE_IMAGE_BYTES + 1,
      type: "image/jpeg",
    }),
  ).toContain("1 MB");
  expect(
    validateProfileImageFile({ size: 100, type: "image/gif" }),
  ).toContain("JPEG, PNG, or WebP");
});
