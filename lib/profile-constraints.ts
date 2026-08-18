/** Shared profile constraints used by both browser hints and Worker validation. */
export const MAX_PROFILE_NAME_CHARACTERS = 80;
export const MAX_PROFILE_BIO_CHARACTERS = 2000;
export const MAX_SOCIAL_URL_CHARACTERS = 300;
export const MAX_PROFILE_SPONSORS = 10;
export const MAX_SPONSOR_NAME_CHARACTERS = 80;
export const MAX_PROFILE_IMAGE_BYTES = 1024 * 1024;

export const PROFILE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProfileImageType = (typeof PROFILE_IMAGE_TYPES)[number];

export const SOCIAL_PLATFORMS = [
  "instagram",
  "tiktok",
  "twitter",
  "youtube",
  "facebook",
  "strava",
  "website",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  youtube: "YouTube",
  facebook: "Facebook",
  strava: "Strava",
  website: "Personal website",
};

/** Social authoring is reserved for accounts with any role beyond member. */
export function canEditSocialLinks(personas: readonly string[]): boolean {
  return personas.some((persona) => persona !== "member");
}

/**
 * Reads a stored CSS object-position (e.g. "center 32%" or "20% 80%") into
 * numeric x/y focus percentages for the crop sliders. Anything unrecognised
 * falls back to the centred default rather than guessing.
 */
export function parseImagePosition(position: string | null | undefined): {
  x: number;
  y: number;
} {
  const fallback = { x: 50, y: 50 };
  if (!position) return fallback;

  const tokens = position.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 2) return fallback;

  const percent = (token: string): number | null => {
    const match = token.match(/^(\d{1,3})(?:\.\d+)?%$/);
    if (!match) return null;
    const value = Number(match[1]);
    return value <= 100 ? value : null;
  };

  let x: number | null = null;
  let y: number | null = null;
  for (const token of tokens) {
    if (token === "left" || token === "right") {
      if (x !== null) return fallback;
      x = token === "left" ? 0 : 100;
      continue;
    }
    if (token === "top" || token === "bottom") {
      if (y !== null) return fallback;
      y = token === "top" ? 0 : 100;
      continue;
    }
    if (token === "center") {
      if (x === null) {
        x = 50;
        continue;
      }
      if (y === null) {
        y = 50;
        continue;
      }
      return fallback;
    }
    const value = percent(token);
    if (value === null) return fallback;
    if (x === null) {
      x = value;
      continue;
    }
    if (y === null) {
      y = value;
      continue;
    }
    return fallback;
  }

  return { x: x ?? 50, y: y ?? 50 };
}
