import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlaylist } from "@/lib/athlete-playlist";
import { getCurrentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { hasAnyAdmin } from "@/lib/persona-admin";
import { canEditSocialLinks } from "@/lib/profile-constraints";
import { getOwnProfile } from "@/lib/profiles";
import { listOccurrencesForRider } from "@/lib/session-occurrences";
import MySessions from "./MySessions";
import { ProfileEditor } from "./ProfileEditor";
import PlaylistEditor from "./PlaylistEditor";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

const PERSONA_LABELS: Record<string, string> = {
  member: "Member",
  theteam: "TheTeam",
  coach: "Coach",
  alumni: "Alumni",
  admin: "Admin",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) redirect("/api/auth/login");

  const db = await getDb();
  const profile = await getOwnProfile(db, user.id);
  const playlist = await getPlaylist(db, user.id);
  const sessions = await listOccurrencesForRider(db, user.id);
  const isAdmin = user.personas.includes("admin");
  const isCoach = user.personas.includes("coach");
  const adminExists = isAdmin || (await hasAnyAdmin(db));
  const publicPersonas = user.personas.filter(
    (persona) => persona !== "member" && persona !== "admin",
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
      <div className="flex items-center gap-5">
        {user.pictureUrl && (
          <Image
            src={user.pictureUrl}
            alt=""
            width={72}
            height={72}
            className="h-18 w-18 rounded-full object-cover"
            unoptimized
          />
        )}
        <div>
          <h1 className="text-3xl font-semibold md:text-4xl">
            {user.displayName ?? "Your profile"}
          </h1>
          {user.email && <p className="mt-1 text-[#56585e]">{user.email}</p>}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#56585e]">
          Your role
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.personas.map((persona) => (
            <span
              key={persona}
              className="rounded-[50px] border border-[#c9c9c9] px-4 py-1.5 text-sm font-medium"
            >
              {PERSONA_LABELS[persona] ?? persona}
            </span>
          ))}
        </div>

        <p className="mt-4 max-w-xl text-[#56585e]">
          {publicPersonas.length > 0
            ? "You appear on the site. Your name, photo, and bio are published once an admin approves them."
            : "You have an account, and you do not appear anywhere on the public site. An admin adds riders and coaches to the site."}
        </p>
      </section>

      <ProfileEditor
        initialDisplayName={user.displayName}
        initialProfile={profile}
        canEditSocials={canEditSocialLinks(user.personas)}
      />

      <MySessions sessions={sessions} />
      <PlaylistEditor initialPlaylistUrl={playlist.playlistUrl} />

      {isCoach && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#56585e]">
            Coaching
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/coach"
              className="inline-flex min-h-11 items-center rounded-[50px] border border-[#c9c9c9] px-6 text-sm font-semibold text-[#56585e] transition-colors hover:border-[#1a1a1a] hover:text-[#1a1a1a]"
            >
              Your calendar
            </Link>
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#56585e]">
            Admin
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              Admin dashboard
            </Link>
            <Link
              href="/admin/profiles"
              className="inline-flex min-h-11 items-center rounded-[50px] border border-[#c9c9c9] px-6 text-sm font-semibold text-[#56585e] transition-colors hover:border-[#1a1a1a] hover:text-[#1a1a1a]"
            >
              Review profiles
            </Link>
          </div>
        </section>
      )}

      {!adminExists && (
        <section className="mt-10 rounded-xl border border-[#e3e3e3] bg-[#f7f7f7] p-6">
          <h2 className="text-xl font-semibold">Set up administration</h2>
          <p className="mt-2 max-w-xl text-sm text-[#56585e]">
            No administrator exists yet. If this account should manage the
            site, finish the one-time setup using the configured admin code.
          </p>
          <Link
            href="/admin/setup"
            className="mt-5 inline-flex min-h-11 items-center rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white transition-colors hover:bg-black"
          >
            Set up the first admin
          </Link>
        </section>
      )}

      <form action="/api/auth/logout" method="post" className="mt-12">
        <button
          type="submit"
          className="min-h-11 rounded-[50px] border border-[#c9c9c9] px-6 text-sm font-semibold text-[#56585e] transition-colors hover:border-[#1a1a1a] hover:text-[#1a1a1a]"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
