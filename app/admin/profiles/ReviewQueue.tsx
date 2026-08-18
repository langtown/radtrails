"use client";

import Image from "next/image";
import { useState } from "react";
import { SOCIAL_LABELS, SOCIAL_PLATFORMS } from "@/lib/profile-constraints";
import type { PendingProfile } from "@/lib/profile-review";

const PERSONA_LABELS: Record<string, string> = {
  member: "Member",
  theteam: "TheTeam",
  coach: "Coach",
  alumni: "Alumni",
  admin: "Admin",
};

export default function ReviewQueue({
  initialProfiles,
}: {
  initialProfiles: PendingProfile[];
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(profileUserId: number, action: "approve" | "reject") {
    setError(null);
    const note = notes[profileUserId]?.trim() ?? "";
    if (action === "reject" && !note) {
      setError("Add feedback before rejecting a profile.");
      return;
    }

    setBusyId(profileUserId);
    try {
      const response = await fetch(
        `/api/admin/profiles/${profileUserId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note: note || null }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "That review could not be saved.",
        );
      }

      setProfiles((current) =>
        current.filter((profile) => profile.userId !== profileUserId),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That review could not be saved.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (profiles.length === 0) {
    return (
      <div className="mt-10 rounded-lg bg-[#f7f7f7] px-6 py-10 text-center">
        <h2 className="text-xl font-semibold">
          No profiles are waiting for review
        </h2>
        <p className="mt-2 text-sm text-[#56585e]">
          New submissions will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-8">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {profiles.map((profile) => {
        const isBusy = busyId === profile.userId;

        return (
          <article
            key={profile.userId}
            className="overflow-hidden rounded-xl border border-[#e3e3e3] bg-white shadow-sm"
          >
            <div className="grid md:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
              <div className="relative min-h-80 bg-[#dadce0]">
                {profile.imageUrl ? (
                  <Image
                    src={profile.imageUrl}
                    alt={`${profile.displayName} profile preview`}
                    fill
                    sizes="(min-width: 768px) 36vw, 100vw"
                    className="object-cover"
                    style={{
                      objectPosition: profile.imagePosition ?? "center 50%",
                    }}
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full min-h-80 items-center justify-center px-6 text-center text-sm text-[#56585e]">
                    No profile photo submitted
                  </div>
                )}
              </div>

              <div className="p-6 md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold">
                      {profile.displayName}
                    </h2>
                    <p className="mt-1 text-xs text-[#56585e]">
                      /{profile.slug}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile.personas.map((persona) => (
                      <span
                        key={persona}
                        className="rounded-[50px] bg-[#f2f3f6] px-3 py-1 text-xs font-semibold"
                      >
                        {PERSONA_LABELS[persona] ?? persona}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="mt-5 whitespace-pre-wrap leading-relaxed text-[#56585e]">
                  {profile.bio || "No bio submitted."}
                </p>

                {profile.sponsors.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[#56585e]">
                      Sponsors
                    </h3>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#56585e]">
                      {profile.sponsors.map((sponsor) => (
                        <li key={sponsor.name}>
                          {sponsor.url ? (
                            <a
                              href={sponsor.url}
                              target="_blank"
                              rel="nofollow noopener noreferrer"
                              className="font-semibold text-[#5025d1] underline"
                            >
                              {sponsor.name}
                            </a>
                          ) : (
                            sponsor.name
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Object.keys(profile.socials).length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[#56585e]">
                      Social links
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      {SOCIAL_PLATFORMS.map((platform) => {
                        const url = profile.socials[platform];
                        return url ? (
                          <a
                            key={platform}
                            href={url}
                            target="_blank"
                            rel="nofollow noopener noreferrer"
                            className="font-semibold text-[#5025d1] underline"
                          >
                            {SOCIAL_LABELS[platform]}
                          </a>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}

                <label
                  htmlFor={`review-note-${profile.userId}`}
                  className="mt-7 block text-sm font-semibold"
                >
                  Feedback if rejected
                </label>
                <textarea
                  id={`review-note-${profile.userId}`}
                  name={`review-note-${profile.userId}`}
                  rows={3}
                  maxLength={500}
                  value={notes[profile.userId] ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [profile.userId]: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-[#c9c9c9] px-3 py-2 outline-none focus:border-[#673de6] focus:ring-2 focus:ring-[#ebe4ff]"
                />

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => decide(profile.userId, "approve")}
                    className="min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                  >
                    {isBusy ? "Saving…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => decide(profile.userId, "reject")}
                    className="min-h-11 rounded-[50px] border border-red-300 px-6 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>

                {profile.submittedAt && (
                  <p className="mt-4 text-xs text-[#56585e]">
                    Submitted {profile.submittedAt} UTC
                  </p>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
