import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import CalendarSubscribe from "@/components/CalendarSubscribe";
import SessionsCalendar from "@/components/SessionsCalendar";
import { deriveZonesFromZone5, getRiderPower } from "@/lib/athlete-ftp";
import { getPlaylist } from "@/lib/athlete-playlist";
import { getCurrentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { hasAnyAdmin } from "@/lib/persona-admin";
import { canEditSocialLinks } from "@/lib/profile-constraints";
import { getOwnProfile } from "@/lib/profiles";
import { listOccurrencesForCalendar } from "@/lib/session-occurrences";
import { listTeamEvents } from "@/lib/team-events";
import TeamRides from "./TeamRides";
import { ProfileEditor } from "./ProfileEditor";
import ProfileSideNav from "./ProfileSideNav";

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
  const calendarSessions = await listOccurrencesForCalendar(db, user.id);
  const isTeamMember = user.personas.includes("theteam");
  const power = isTeamMember ? await getRiderPower(db, user.id) : null;
  const isAdmin = user.personas.includes("admin");
  const isCoach = user.personas.includes("coach");
  // Everyone but a plain member-only account can see team rides and who is
  // going; only theteam riders can RSVP to them.
  const canSeeTeamRides = user.personas.some((persona) => persona !== "member");
  const teamEvents = canSeeTeamRides ? await listTeamEvents(db) : [];
  const teamRides = teamEvents.map((teamEvent) => ({
    ...teamEvent,
    viewerUnavailable: teamEvent.absentees.some(
      (absentee) => absentee.id === user.id,
    ),
  }));
  const adminExists = isAdmin || (await hasAnyAdmin(db));
  const publicPersonas = user.personas.filter(
    (persona) => persona !== "member" && persona !== "admin",
  );

  const navItems = [
    { id: "profile-overview", label: "Profile" },
    { id: "profile-editor", label: "Edit profile" },
    ...(isCoach || calendarSessions.length > 0 || teamEvents.length > 0
      ? [{ id: "sessions-calendar", label: "Calendar" }]
      : []),
    ...(canSeeTeamRides ? [{ id: "team-rides", label: "Group Rides" }] : []),
    ...(power ? [{ id: "power-zones", label: "Power zones" }] : []),
    ...(isCoach ? [{ id: "coaching", label: "Coaching" }] : []),
    { id: "sign-out", label: "Sign out" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <div className="flex gap-10">
        <ProfileSideNav items={navItems} />

        <div className="min-w-0 flex-1">
          <div id="profile-overview" className="flex items-center gap-5">
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
              {user.email && <p className="mt-1 text-white/55">{user.email}</p>}
            </div>
          </div>

          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/55">
              Your role
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {user.personas.map((persona) => (
                <span
                  key={persona}
                  className="rounded-[50px] border border-white/10 px-4 py-1.5 text-sm font-medium"
                >
                  {PERSONA_LABELS[persona] ?? persona}
                </span>
              ))}
            </div>

            <p className="mt-4 max-w-xl text-white/55">
              {publicPersonas.length > 0
                ? "You appear on the site. Your name, photo, and bio are published once an admin approves them."
                : "You have an account, and you do not appear anywhere on the public site. An admin adds riders and coaches to the site."}
            </p>
          </section>

          <div id="profile-editor">
            <ProfileEditor
              initialDisplayName={user.displayName}
              initialProfile={profile}
              canEditSocials={canEditSocialLinks(user.personas)}
              initialPlaylistUrl={playlist.playlistUrl}
            />
          </div>

          {(isCoach || calendarSessions.length > 0 || teamEvents.length > 0) && (
            <div id="sessions-calendar">
              <SessionsCalendar
                sessions={calendarSessions}
                perspective="rider"
                teamEvents={teamEvents}
              />
              {(isCoach ||
                calendarSessions.some((session) => session.status === "scheduled")) && (
                <details className="mt-6 max-w-xl">
                  <summary className="cursor-pointer text-sm font-semibold text-white/55">
                    Add sessions to your calendar app
                  </summary>
                  <CalendarSubscribe />
                </details>
              )}
            </div>
          )}

          {canSeeTeamRides && (
            <div id="team-rides">
              <TeamRides initialRides={teamRides} canRsvp={isTeamMember} />
            </div>
          )}

          {power && (
            <section id="power-zones" className="mt-10 border-t border-white/10 pt-8">
              <h2 className="text-xl font-semibold">Your power zones</h2>
              {power.zone5Watts !== null ? (
                <>
                  <p className="mt-2 text-white/55">
                    FTP{" "}
                    <span className="text-2xl font-semibold text-white">
                      {deriveZonesFromZone5(power.zone5Watts).ftpWatts} W
                    </span>{" "}
                    — derived from your Zone 5 power ({power.zone5Watts} W)
                    {power.updatedAt &&
                      `, set by your coach on ${power.updatedAt.slice(0, 10)}`}
                  </p>
                  <ul className="mt-4 max-w-md divide-y divide-white/10">
                    {deriveZonesFromZone5(power.zone5Watts).zones.map((zone) => (
                      <li
                        key={zone.zone}
                        className="flex items-baseline justify-between py-2 text-sm"
                      >
                        <span>
                          <span className="font-semibold">{zone.zone}</span>{" "}
                          <span className="text-white/55">{zone.label}</span>
                        </span>
                        <span className="font-medium">
                          {zone.minWatts === null
                            ? `up to ${zone.maxWatts} W`
                            : zone.maxWatts === null
                              ? `${zone.minWatts} W+`
                              : `${zone.minWatts}–${zone.maxWatts} W`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-white/55">
                  Your coach has not set your Zone 5 power yet.
                </p>
              )}
            </section>
          )}

          {isCoach && (
            <section id="coaching" className="mt-10">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/55">
                Coaching
              </h2>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href="/coach"
                  className="inline-flex min-h-11 items-center rounded-[50px] border border-white/10 px-6 text-sm font-semibold text-white/55 transition-colors hover:border-white/25 hover:text-white"
                >
                  Your calendar
                </Link>
              </div>
            </section>
          )}

          {!adminExists && (
            <section className="mt-10 rounded-xl border border-white/10 bg-[#101016] p-6">
              <h2 className="text-xl font-semibold">Set up administration</h2>
              <p className="mt-2 max-w-xl text-sm text-white/55">
                No administrator exists yet. If this account should manage the
                site, finish the one-time setup using the configured admin code.
              </p>
              <Link
                href="/admin/setup"
                className="mt-5 inline-flex min-h-11 items-center rounded-[50px] bg-[#17171d] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#23232b]"
              >
                Set up the first admin
              </Link>
            </section>
          )}

          <div id="sign-out">
            <form action="/api/auth/logout" method="post" className="mt-12">
              <button
                type="submit"
                className="min-h-11 rounded-[50px] border border-white/10 px-6 text-sm font-semibold text-white/55 transition-colors hover:border-white/25 hover:text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
