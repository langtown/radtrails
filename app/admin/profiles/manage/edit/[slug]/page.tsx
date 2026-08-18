"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  buildProfilePayload,
  validateProfileImageFile,
} from "@/app/profile/ProfileEditor";
import { PERSONA_KEYS, type PersonaKey } from "@/lib/personas";
import {
  MAX_PROFILE_BIO_CHARACTERS,
  MAX_PROFILE_NAME_CHARACTERS,
  MAX_PROFILE_SPONSORS,
  MAX_SOCIAL_URL_CHARACTERS,
  MAX_SPONSOR_NAME_CHARACTERS,
  PROFILE_IMAGE_TYPES,
  SOCIAL_LABELS,
  SOCIAL_PLATFORMS,
  parseImagePosition,
} from "@/lib/profile-constraints";
import type { AdminProfile } from "@/lib/profiles";

const PERSONA_LABELS: Record<PersonaKey, string> = {
  member: "Member",
  theteam: "TheTeam",
  coach: "Coach",
  alumni: "Alumni",
  admin: "Admin",
};

type Feedback = { kind: "error" | "success"; message: string } | null;

function statusLabel(status: string): string {
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
      return status;
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

export default function AdminProfileEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  /** Which axis the photo overflows the card on, i.e. which slider moves it. */
  const [overflowAxis, setOverflowAxis] = useState<"x" | "y" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [personaBusy, setPersonaBusy] = useState<PersonaKey | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(
    null,
  );
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  const previewUrl = previewObjectUrl ?? profile?.imageUrl ?? null;

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/profiles/${encodeURIComponent(slug)}`,
        );
        const body = (await response.json().catch(() => null)) as {
          profile?: AdminProfile;
          error?: unknown;
        } | null;
        if (!response.ok || !body?.profile) {
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "Profile could not be loaded.",
          );
        }
        if (!cancelled) {
          setProfile(body.profile);
          const position = parseImagePosition(body.profile.imagePosition);
          setCropX(position.x);
          setCropY(position.y);
        }
      } catch (caught) {
        if (!cancelled) {
          setLoadError(
            caught instanceof Error
              ? caught.message
              : "Profile could not be loaded.",
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    // Capture synchronously: currentTarget is null after the first await.
    const form = event.currentTarget;
    setIsSaving(true);
    setFeedback(null);
    try {
      // A newly chosen photo uploads first so its key can go in the payload.
      let nextImageKey = profile.imageKey;
      let nextImageUrl = profile.imageUrl;
      if (selectedFile) {
        const upload = await fetch(
          `/api/admin/profiles/${encodeURIComponent(slug)}/image`,
          {
            method: "POST",
            headers: { "Content-Type": selectedFile.type },
            body: selectedFile,
          },
        );
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
        nextImageUrl = uploaded.url;
      }

      const payload = buildProfilePayload(
        new FormData(form),
        nextImageKey,
        true,
      );

      const response = await fetch(
        `/api/admin/profiles/${encodeURIComponent(slug)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await errorMessage(response));

      setProfile((current) =>
        current
          ? {
              ...current,
              displayName: payload.displayName,
              bio: payload.bio,
              imageKey: payload.imageKey,
              imageUrl: nextImageUrl,
              imagePosition: payload.imagePosition,
              socials: payload.socials,
              sponsors: payload.sponsors,
              status: "approved",
              reviewNote: null,
            }
          : current,
      );
      selectImage(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      setFeedback({
        kind: "success",
        message: "Saved. The updated profile is approved and live.",
      });
    } catch (caught) {
      setFeedback({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "That change could not be saved. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePersona(persona: PersonaKey, grant: boolean) {
    if (!profile) return;

    setPersonaBusy(persona);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/admin/users/${profile.userId}/personas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            persona,
            action: grant ? "grant" : "revoke",
          }),
        },
      );
      if (!response.ok) throw new Error(await errorMessage(response));

      setProfile((current) => {
        if (!current) return current;
        const personas = grant
          ? [...current.personas, persona]
          : current.personas.filter((held) => held !== persona);
        return { ...current, personas };
      });
    } catch (caught) {
      setFeedback({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "That persona change could not be saved.",
      });
    } finally {
      setPersonaBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:px-8">
      <Link
        href="/admin/profiles/manage"
        className="text-sm font-semibold text-[#5025d1] underline"
      >
        Back to profiles
      </Link>

      {loadError && (
        <p
          role="alert"
          className="mt-8 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {loadError}
        </p>
      )}
      {!loadError && !profile && (
        <p className="mt-8 text-sm text-[#56585e]">Loading profile…</p>
      )}

      {profile && (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">
                Edit {profile.displayName}
              </h1>
              <p className="mt-1 text-xs text-[#56585e]">/{profile.slug}</p>
            </div>
            <span className="rounded-[50px] bg-[#f2f3f6] px-3 py-1 text-xs font-semibold">
              {statusLabel(profile.status)}
            </span>
          </div>

          {profile.status === "rejected" && profile.reviewNote && (
            <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Latest review feedback: {profile.reviewNote}
            </p>
          )}

          <section className="mt-8 rounded-xl border border-[#e3e3e3] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Personas</h2>
            <p className="mt-2 text-sm text-[#56585e]">
              Personas decide whether and where this person appears on the
              site. Changes apply immediately.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
              {PERSONA_KEYS.map((persona) => {
                const held = profile.personas.includes(persona);
                return (
                  <label
                    key={persona}
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    <input
                      type="checkbox"
                      checked={held}
                      disabled={personaBusy !== null}
                      onChange={(event) =>
                        void togglePersona(persona, event.target.checked)
                      }
                      className="h-4 w-4 accent-[#673de6]"
                    />
                    {PERSONA_LABELS[persona]}
                  </label>
                );
              })}
            </div>
          </section>

          <form onSubmit={(event) => void save(event)} className="mt-8 space-y-6">
            <div className="grid gap-6 md:grid-cols-[minmax(220px,0.6fr)_minmax(0,1.4fr)]">
              <div>
                <div className="relative h-56 w-full overflow-hidden rounded-lg bg-[#dadce0]">
                  {previewUrl ? (
                    <Image
                      alt={`${profile.displayName} profile photo`}
                      fill
                      sizes="(min-width: 768px) 25vw, 100vw"
                      className="object-cover"
                      src={previewUrl}
                      style={{ objectPosition: `${cropX}% ${cropY}%` }}
                      onLoad={(event) => {
                        const img = event.currentTarget;
                        const box =
                          img.parentElement?.getBoundingClientRect();
                        if (!img.naturalHeight || !box || box.height === 0) {
                          return;
                        }
                        // object-cover only crops the axis the photo
                        // overflows on: wide photos move horizontally, tall
                        // photos vertically.
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
                      No profile photo
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <label
                    htmlFor="photo"
                    className="block text-sm font-semibold"
                  >
                    {profile.imageUrl ? "Replace photo" : "Choose a photo"}
                  </label>
                  <input
                    ref={imageInputRef}
                    id="photo"
                    type="file"
                    accept={PROFILE_IMAGE_TYPES.join(",")}
                    onChange={(event) =>
                      selectImage(event.target.files?.[0] ?? null)
                    }
                    className="mt-2 block w-full text-sm file:mr-3 file:rounded-[50px] file:border-0 file:bg-[#1a1a1a] file:px-4 file:py-2 file:font-semibold file:text-white"
                  />
                  <p className="mt-1 text-xs leading-relaxed text-[#56585e]">
                    JPEG, PNG, or WebP up to 1 MB. The photo is uploaded when
                    you save.
                  </p>
                </div>
                {previewUrl && (
                  <div className="mt-3">
                    <label
                      htmlFor="cropY"
                      className="block text-sm font-semibold"
                    >
                      Vertical crop focus: {cropY}%
                    </label>
                    {overflowAxis === "x" && (
                      <input type="hidden" name="cropY" value={cropY} />
                    )}
                    <input
                      id="cropY"
                      name="cropY"
                      type="range"
                      min={0}
                      max={100}
                      value={cropY}
                      disabled={overflowAxis === "x"}
                      onChange={(event) => setCropY(Number(event.target.value))}
                      className="mt-2 w-full accent-[#673de6] disabled:opacity-40"
                    />
                    <label
                      htmlFor="cropX"
                      className="mt-3 block text-sm font-semibold"
                    >
                      Horizontal crop focus: {cropX}%
                    </label>
                    {overflowAxis === "y" && (
                      <input type="hidden" name="cropX" value={cropX} />
                    )}
                    <input
                      id="cropX"
                      name="cropX"
                      type="range"
                      min={0}
                      max={100}
                      value={cropX}
                      disabled={overflowAxis === "y"}
                      onChange={(event) => setCropX(Number(event.target.value))}
                      className="mt-2 w-full accent-[#673de6] disabled:opacity-40"
                    />
                    {overflowAxis === "x" && (
                      <p className="mt-2 text-xs text-amber-700">
                        This photo is wider than the card, so it moves with
                        the horizontal focus; the vertical focus has no
                        visible effect.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="displayName"
                    className="block text-sm font-semibold"
                  >
                    Display name
                  </label>
                  <input
                    id="displayName"
                    name="displayName"
                    required
                    maxLength={MAX_PROFILE_NAME_CHARACTERS}
                    defaultValue={profile.displayName}
                    className="mt-2 w-full rounded-lg border border-[#c9c9c9] px-3 py-2 outline-none focus:border-[#673de6] focus:ring-2 focus:ring-[#ebe4ff]"
                  />
                </div>
                <div>
                  <label htmlFor="bio" className="block text-sm font-semibold">
                    Bio
                  </label>
                  <textarea
                    id="bio"
                    name="bio"
                    rows={6}
                    maxLength={MAX_PROFILE_BIO_CHARACTERS}
                    defaultValue={profile.bio ?? ""}
                    className="mt-2 w-full rounded-lg border border-[#c9c9c9] px-3 py-2 outline-none focus:border-[#673de6] focus:ring-2 focus:ring-[#ebe4ff]"
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold">Sponsors</h2>
              <p className="mt-1 text-sm text-[#56585e]">
                One sponsor per line, shown on the public profile. Add a link
                after a name like:{" "}
                <code>Rad Bikes | https://radbikes.example</code>
              </p>
              <textarea
                id="sponsors"
                name="sponsors"
                rows={4}
                maxLength={
                  (MAX_PROFILE_SPONSORS + 1) *
                  (MAX_SPONSOR_NAME_CHARACTERS + MAX_SOCIAL_URL_CHARACTERS)
                }
                defaultValue={profile.sponsors
                  .map((sponsor) =>
                    sponsor.url
                      ? `${sponsor.name} | ${sponsor.url}`
                      : sponsor.name,
                  )
                  .join("\n")}
                className="mt-3 w-full rounded-lg border border-[#c9c9c9] px-3 py-2 outline-none focus:border-[#673de6] focus:ring-2 focus:ring-[#ebe4ff]"
              />
            </div>

            <div>
              <h2 className="text-xl font-semibold">Social links</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {SOCIAL_PLATFORMS.map((platform) => (
                  <div key={platform}>
                    <label
                      htmlFor={`social-${platform}`}
                      className="block text-sm font-semibold"
                    >
                      {SOCIAL_LABELS[platform]}
                    </label>
                    <input
                      id={`social-${platform}`}
                      name={`social-${platform}`}
                      type="text"
                      maxLength={MAX_SOCIAL_URL_CHARACTERS}
                      defaultValue={profile.socials[platform] ?? ""}
                      className="mt-2 w-full rounded-lg border border-[#c9c9c9] px-3 py-2 outline-none focus:border-[#673de6] focus:ring-2 focus:ring-[#ebe4ff]"
                    />
                  </div>
                ))}
              </div>
            </div>

            {feedback && (
              <p
                role="alert"
                className={`rounded-lg border px-4 py-3 text-sm ${
                  feedback.kind === "success"
                    ? "border-green-300 bg-green-50 text-green-800"
                    : "border-red-300 bg-red-50 text-red-800"
                }`}
              >
                {feedback.message}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={isSaving}
                className="min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save and publish"}
              </button>
              <p className="text-xs text-[#56585e]">
                Saving approves the profile and publishes it immediately.
              </p>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
