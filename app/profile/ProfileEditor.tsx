"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_PROFILE_BIO_CHARACTERS,
  MAX_PROFILE_IMAGE_BYTES,
  MAX_PROFILE_NAME_CHARACTERS,
  MAX_SOCIAL_URL_CHARACTERS,
  PROFILE_IMAGE_TYPES,
  SOCIAL_LABELS,
  SOCIAL_PLATFORMS,
  parseImagePosition,
  type SocialLinks,
} from "@/lib/profile-constraints";
import type { OwnProfile } from "@/lib/profiles";

const SOCIAL_PLACEHOLDERS: Record<
  (typeof SOCIAL_PLATFORMS)[number],
  string
> = {
  instagram: "yourname",
  tiktok: "@yourname",
  twitter: "yourname",
  youtube: "@yourname",
  facebook: "yourname",
  strava: "12345",
  website: "your-site.example",
};

const SOCIAL_BASE: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
  instagram: "https://instagram.com/",
  tiktok: "https://tiktok.com/@",
  twitter: "https://x.com/",
  youtube: "https://youtube.com/@",
  facebook: "https://facebook.com/",
  strava: "https://strava.com/athletes/",
  website: "https://",
};

type ProfilePayload = {
  displayName: string;
  bio: string;
  imageKey: string | null;
  imagePosition: string | null;
  socials: SocialLinks;
};

type Feedback = { kind: "error" | "success"; message: string } | null;

function formString(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function buildProfilePayload(
  data: FormData,
  imageKey: string | null,
  allowSocials: boolean,
): ProfilePayload {
  const socials: SocialLinks = {};
  if (allowSocials) {
    for (const platform of SOCIAL_PLATFORMS) {
      let value = formString(data, `social-${platform}`).trim();
      if (!value) continue;

      // If the user supplied a full URL (has a scheme), use it verbatim.
      // Otherwise, construct a full HTTPS URL from a platform-specific base.
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
      let url = value;
      if (!hasScheme) {
        if (platform === "website") {
          // For website, assume the user gave a host or path; ensure https://
          url = value.startsWith("https://") || value.startsWith("http://")
            ? value
            : `https://${value}`;
        } else {
          // Remove a leading @ if present for platforms that use @
          if ((platform === "tiktok" || platform === "youtube") && value.startsWith("@")) {
            value = value.slice(1);
          }
          url = SOCIAL_BASE[platform] + value;
        }
      }

      socials[platform] = url;
    }
  }

  // `|| 50` would be wrong here: it turns a deliberate 0% (edge focus) into
  // 50%. Only fall back when the field is missing or unparsable.
  const cropX = parseCropValue(data, "cropX");
  const cropY = parseCropValue(data, "cropY");

  return {
    displayName: formString(data, "displayName"),
    bio: formString(data, "bio"),
    imageKey,
    imagePosition: imageKey ? `${cropX}% ${cropY}%` : null,
    socials,
  };
}

function parseCropValue(data: FormData, key: string): number {
  const parsed = Number.parseInt(formString(data, key), 10);
  return Number.isNaN(parsed) ? 50 : Math.max(0, Math.min(100, parsed));
}

export function validateProfileImageFile(file: {
  size: number;
  type: string;
}): string | null {
  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    return "Image is too large. Please choose a file that is 1 MB or smaller.";
  }
  if (!(PROFILE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Please choose a JPEG, PNG, or WebP image.";
  }
  return null;
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "approved":
      return "Approved and live";
    case "rejected":
      return "Changes requested";
    case "draft":
      return "Draft";
    default:
      return "Not submitted";
  }
}

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string"
    ? body.error
    : "That change could not be saved. Please try again.";
}

export function ProfileEditor({
  initialDisplayName,
  initialProfile,
  canEditSocials,
}: {
  initialDisplayName: string | null;
  initialProfile: OwnProfile | null;
  canEditSocials: boolean;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [imageKey, setImageKey] = useState(initialProfile?.imageKey ?? null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [cropX, setCropX] = useState(
    () => parseImagePosition(initialProfile?.imagePosition).x,
  );
  const [cropY, setCropY] = useState(
    () => parseImagePosition(initialProfile?.imagePosition).y,
  );
  /** Which axis the photo overflows the card on, i.e. which slider moves it. */
  const [overflowAxis, setOverflowAxis] = useState<"x" | "y" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

  const previewUrl = previewObjectUrl ?? profile?.imageUrl ?? null;

  function selectImage(file: File | null) {
    setFeedback(null);
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    if (!file) {
      setSelectedFile(null);
      setPreviewObjectUrl(null);
      return;
    }

    const error = validateProfileImageFile(file);
    if (error) {
      setSelectedFile(null);
      setPreviewObjectUrl(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      setFeedback({ kind: "error", message: error });
      return;
    }
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    previewObjectUrlRef.current = objectUrl;
    setPreviewObjectUrl(objectUrl);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setIsSaving(true);
    setFeedback(null);

    try {
      let nextImageKey = imageKey;
      if (selectedFile) {
        const upload = await fetch("/api/profile/image", {
          method: "POST",
          headers: { "Content-Type": selectedFile.type },
          body: selectedFile,
        });
        if (!upload.ok) throw new Error(await errorMessage(upload));

        const uploaded = (await upload.json()) as {
          imageKey?: unknown;
          url?: unknown;
        };
        if (
          typeof uploaded.imageKey !== "string" ||
          typeof uploaded.url !== "string"
        ) {
          throw new Error("The image upload returned an invalid response.");
        }
        nextImageKey = uploaded.imageKey;
      }

      const payload = buildProfilePayload(
        formData,
        nextImageKey,
        canEditSocials,
      );
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await errorMessage(response));

      const body = (await response.json()) as { profile?: OwnProfile };
      if (!body.profile) {
        throw new Error("The profile save returned an invalid response.");
      }

      setProfile(body.profile);
      setImageKey(body.profile.imageKey);
      selectImage(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      setFeedback({
        kind: "success",
        message: "Profile submitted for review.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "That change could not be saved. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  const inputClass =
    "mt-2 min-h-11 w-full rounded-lg border border-[#c9c9c9] bg-white px-3 py-2 text-[#1a1a1a] outline-none transition focus:border-[#673de6] focus:ring-2 focus:ring-[#ebe4ff]";

  return (
    <form onSubmit={submit} className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e3e3] pb-5">
        <div>
          <h2 className="text-2xl font-semibold">Profile details</h2>
          <p className="mt-1 text-sm text-[#56585e]">
            Saving sends all profile changes to an admin for review.
          </p>
        </div>
        <span className="rounded-[50px] bg-[#ebe4ff] px-4 py-2 text-sm font-semibold text-[#5025d1]">
          {statusLabel(profile?.status)}
        </span>
      </div>

      {profile?.status === "rejected" && profile.reviewNote && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">Reviewer feedback</p>
          <p className="mt-1 whitespace-pre-wrap">{profile.reviewNote}</p>
        </div>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section>
          <h3 className="font-semibold">Profile photo</h3>
          <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-lg bg-[#dadce0]">
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt="Profile card preview"
                fill
                sizes="(min-width: 768px) 35vw, 100vw"
                className="object-cover"
                style={{ objectPosition: `${cropX}% ${cropY}%` }}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  const box = img.parentElement?.getBoundingClientRect();
                  if (!img.naturalHeight || !box || box.height === 0) return;
                  // object-cover only crops the axis the photo overflows on:
                  // wide photos move horizontally, tall photos vertically.
                  const ratio = img.naturalWidth / img.naturalHeight;
                  const boxRatio = box.width / box.height;
                  setOverflowAxis(
                    ratio > boxRatio * 1.01
                      ? "x"
                      : ratio < boxRatio / 1.01
                        ? "y"
                        : null,
                  );
                }}
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#56585e]">
                Your profile photo preview will appear here.
              </div>
            )}
          </div>

          <label className="mt-4 block text-sm font-semibold" htmlFor="photo">
            Choose a photo
          </label>
          <input
            ref={imageInputRef}
            id="photo"
            type="file"
            accept={PROFILE_IMAGE_TYPES.join(",")}
            onChange={(event) => selectImage(event.target.files?.[0] ?? null)}
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-[50px] file:border-0 file:bg-[#1a1a1a] file:px-4 file:py-2 file:font-semibold file:text-white"
          />
          <p className="mt-2 text-xs leading-relaxed text-[#56585e]">
            JPEG, PNG, or WebP up to 1 MB. Resize large phone photos before
            uploading.
          </p>

          <label className="mt-5 block text-sm font-semibold" htmlFor="cropY">
            Vertical crop focus: {cropY}%
          </label>
          {overflowAxis === "x" && (
            <input type="hidden" name="cropY" value={cropY} />
          )}
          <input
            id="cropY"
            name="cropY"
            type="range"
            min="0"
            max="100"
            value={cropY}
            disabled={!previewUrl || overflowAxis === "x"}
            onChange={(event) => setCropY(Number(event.target.value))}
            className="mt-2 w-full accent-[#673de6] disabled:opacity-40"
          />

          <label className="mt-4 block text-sm font-semibold" htmlFor="cropX">
            Horizontal crop focus: {cropX}%
          </label>
          {overflowAxis === "y" && (
            <input type="hidden" name="cropX" value={cropX} />
          )}
          <input
            id="cropX"
            name="cropX"
            type="range"
            min="0"
            max="100"
            value={cropX}
            disabled={!previewUrl || overflowAxis === "y"}
            onChange={(event) => setCropX(Number(event.target.value))}
            className="mt-2 w-full accent-[#673de6] disabled:opacity-40"
          />

          <p className="mt-1 text-xs text-[#56585e]">
            Move the focus until the card preview crops your photo correctly.
          </p>
          {overflowAxis === "x" && previewUrl && (
            <p className="mt-1 text-xs text-amber-700">
              This photo is wider than the profile card, so it moves with the
              horizontal focus; the vertical focus has no visible effect.
            </p>
          )}
          {overflowAxis === "y" && previewUrl && (
            <p className="mt-1 text-xs text-[#56585e]">
              This photo fills the card width, so the horizontal focus has no
              visible effect.
            </p>
          )}
        </section>

        <section className="space-y-5">
          <div>
            <label className="block text-sm font-semibold" htmlFor="displayName">
              Display name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              required
              maxLength={MAX_PROFILE_NAME_CHARACTERS}
              defaultValue={profile?.displayName ?? initialDisplayName ?? ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold" htmlFor="bio">
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={9}
              maxLength={MAX_PROFILE_BIO_CHARACTERS}
              defaultValue={profile?.bio ?? ""}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[#56585e]">
              Up to {MAX_PROFILE_BIO_CHARACTERS.toLocaleString()} characters.
            </p>
          </div>
        </section>
      </div>

      {canEditSocials ? (
        <section className="mt-10 border-t border-[#e3e3e3] pt-8">
          <h3 className="text-xl font-semibold">Social links</h3>
          <p className="mt-1 text-sm text-[#56585e]">
            Optional HTTPS links that can appear with your approved profile.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {SOCIAL_PLATFORMS.map((platform) => (
              <div key={platform}>
                <label
                  className="block text-sm font-semibold"
                  htmlFor={`social-${platform}`}
                >
                  {SOCIAL_LABELS[platform]}
                </label>
                <input
                  id={`social-${platform}`}
                  name={`social-${platform}`}
                  type="text"
                  inputMode="text"
                  maxLength={MAX_SOCIAL_URL_CHARACTERS}
                  placeholder={SOCIAL_PLACEHOLDERS[platform]}
                  defaultValue={profile?.socials[platform] ?? ""}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="mt-10 rounded-lg bg-[#f7f7f7] px-5 py-4 text-sm text-[#56585e]">
          Social links are available when an admin adds a team, coach, alumni,
          or admin persona.
        </p>
      )}

      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
            feedback.kind === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="submit"
          disabled={isSaving}
          className="min-h-12 rounded-[50px] bg-[#1a1a1a] px-8 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-wait disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Submit for review"}
        </button>
        {profile?.submittedAt && (
          <span className="text-xs text-[#56585e]">
            Last submitted {profile.submittedAt} UTC
          </span>
        )}
      </div>
    </form>
  );
}
