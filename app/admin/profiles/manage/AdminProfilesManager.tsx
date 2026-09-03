"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PERSONA_KEYS, PERSONA_DESCRIPTIONS, type PersonaKey } from "@/lib/personas";
import type { AdminProfileListItem } from "@/lib/profiles";

const PERSONA_LABELS: Record<string, string> = {
  member: "Member",
  theteam: "Team members",
  coach: "Coach",
  alumni: "Alumni",
  admin: "Admin",
  radfriends: "RadFriends",
  private: "Private",
};

function statusLabel(status: string | null): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Changes requested";
    case "draft":
      return "Draft";
    default:
      return "No profile submitted";
  }
}

function PersonaSelector({
  persona,
  setPersona,
}: {
  persona: PersonaKey;
  setPersona: (persona: PersonaKey) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="admin-persona" className="text-sm font-semibold">
        Persona
      </label>
      <select
        id="admin-persona"
        value={persona}
        onChange={(event) => setPersona(event.target.value as PersonaKey)}
        className="rounded-lg border border-[#c9c9c9] px-3 py-2 outline-none focus:border-[#673de6] focus:ring-2 focus:ring-[#ebe4ff]"
      >
        {PERSONA_KEYS.map((option) => (
          <option key={option} value={option}>
            {PERSONA_LABELS[option] ?? option}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProfileCard({ profile }: { profile: AdminProfileListItem }) {
  const name =
    profile.displayName ?? profile.accountName ?? profile.email ?? "Unnamed";

  const body = (
    <>
      <div className="relative h-48 w-full bg-[#dadce0]">
        {profile.imageUrl ? (
          <Image
            src={profile.imageUrl}
            alt={`${name} profile photo`}
            fill
            sizes="(min-width: 768px) 30vw, 100vw"
            className="object-cover"
            style={{ objectPosition: profile.imagePosition ?? "center 50%" }}
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#56585e]">
            No profile photo
          </div>
        )}
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{name}</h3>
          <span className="rounded-[50px] bg-[#f2f3f6] px-3 py-1 text-xs font-semibold">
            {statusLabel(profile.status)}
          </span>
        </div>
        {profile.slug && (
          <p className="mt-1 text-xs text-[#56585e]">/{profile.slug}</p>
        )}
        <p className="mt-3 line-clamp-3 text-sm text-[#56585e]">
          {profile.bio || "No bio submitted."}
        </p>
      </div>
    </>
  );

  // Accounts without a profile have no slug to edit against yet; they become
  // editable as soon as the owner submits one.
  if (!profile.slug) {
    return (
      <article className="overflow-hidden rounded-xl border border-[#e3e3e3] bg-white opacity-75 shadow-sm">
        {body}
      </article>
    );
  }

  return (
    <Link
      href={`/admin/profiles/manage/edit/${profile.slug}`}
      className="block overflow-hidden rounded-xl border border-[#e3e3e3] bg-white shadow-sm transition hover:border-[#673de6] hover:shadow-md"
    >
      {body}
    </Link>
  );
}

export default function AdminProfilesManager() {
  const [persona, setPersona] = useState<PersonaKey>(PERSONA_KEYS[0]);
  const [profiles, setProfiles] = useState<AdminProfileListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize persona from the query string when present, so links like
  // /admin/profiles/manage?persona=theteam land on the expected filter.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("persona");
      if (p && (PERSONA_KEYS as readonly string[]).includes(p)) {
        setPersona(p as PersonaKey);
      }
    } catch {
      // ignore URL parsing errors
    }
    // run only once
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/profiles?persona=${encodeURIComponent(persona)}`,
        );
        const body = (await response.json().catch(() => null)) as {
          profiles?: AdminProfileListItem[];
          error?: unknown;
        } | null;
        if (!response.ok) {
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "Profiles could not be loaded.",
          );
        }
        if (!cancelled) setProfiles(body?.profiles ?? []);
      } catch (caught) {
        if (!cancelled) {
          setProfiles([]);
          setError(
            caught instanceof Error
              ? caught.message
              : "Profiles could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [persona]);

  return (
    <div className="mt-8">
      <PersonaSelector persona={persona} setPersona={setPersona} />

      <p className="mt-3 text-sm text-[#56585e]">
        {PERSONA_DESCRIPTIONS[persona] ?? "No description available."}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="mt-10 text-sm text-[#56585e]">Loading profiles…</p>
      ) : (
        !error &&
        (profiles.length === 0 ? (
          <div className="mt-10 rounded-lg bg-[#f7f7f7] px-6 py-10 text-center">
            <h2 className="text-xl font-semibold">
              Nobody holds the {PERSONA_LABELS[persona] ?? persona} persona
            </h2>
            <p className="mt-2 text-sm text-[#56585e]">
              Grant it from a profile editor and the account will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {profiles.map((profile) => (
              <ProfileCard key={profile.userId} profile={profile} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
