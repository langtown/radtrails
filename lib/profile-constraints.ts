/** Shared profile constraints used by both browser hints and Worker validation. */
export const MAX_PROFILE_NAME_CHARACTERS = 80;
export const MAX_PROFILE_BIO_CHARACTERS = 2000;
export const MAX_SOCIAL_URL_CHARACTERS = 300;
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
