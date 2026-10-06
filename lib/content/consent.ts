import { site } from "./site";

// Bump when the disclosure wording changes, so stored records show which
// version a guardian agreed to.
export const CONSENT_VERSION = "2026-10-05";

export const GUARDIAN_RELATIONSHIPS = ["Parent", "Legal guardian"] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

// Shown on the profile page above the e-signature. Plain-language parental
// consent / media release. Reviewed-by-counsel wording can replace this later;
// the CONSENT_VERSION above records which text was signed.
export const MINOR_CONSENT_DISCLOSURE = [
  `I am the parent or legal guardian of the rider named below, who is under 18 years old.`,
  `I give my consent for ${site.name} to publish the rider's name, photo, biography, and any social links the rider provides on ${site.domain} and the ${site.name} social media accounts, in connection with its mountain bike programs.`,
  `I understand this information will be publicly visible, that I am not required to provide it, and that I may ask ${site.name} to review, update, or remove it at any time by contacting ${site.email}.`,
  `I confirm the information submitted is accurate, that I have the right to provide any photo uploaded, and that typing my name below serves as my electronic signature.`,
] as const;
