import Image from "next/image";
import Link from "next/link";
import type { AdminDashboardStats } from "@/lib/persona-admin";
import type { AdminProfileListItem } from "@/lib/profiles";
import { PERSONA_KEYS } from "@/lib/personas";

type Coach = { id: number; displayName: string };

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

export default function AdminDashboard({
  stats,
  coaches,
  profilesByPersona,
  coachProfiles,
}: {
  stats: AdminDashboardStats;
  coaches: Coach[];
  profilesByPersona?: Record<string, AdminProfileListItem[]>;
  coachProfiles?: AdminProfileListItem[];
}) {
  const PERSONA_LABELS: Record<string, string> = {
    member: "Member",
    theteam: "Team members",
    coach: "Coach",
    alumni: "Alumni",
    admin: "Admin",
    radfriends: "RadFriends",
    private: "Private",
  };

  // Use the canonical persona list for ordering
  const personaOrder = [...PERSONA_KEYS];

  // Backwards compatibility: if profilesByPersona wasn't supplied, use coachProfiles
  const effectiveProfilesByPersona: Record<string, AdminProfileListItem[]> =
    profilesByPersona ?? { coach: coachProfiles ?? [] };

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-[#673de6]">
          Administration
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-5">
          <h1 className="text-3xl font-semibold md:text-4xl">
            Admin dashboard
          </h1>
          <Link
            href="/admin/docs"
            className="text-sm font-semibold text-[#5025d1] underline"
          >
            📒 Admin guide
          </Link>
        </div>
        <p className="mt-4 max-w-2xl text-[#56585e]">
          Manage member profiles and control where each person appears on the
          site.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[#e3e3e3] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Coach calendars</h2>
          <p className="mt-1 text-sm text-[#56585e]">
            Manage a coach&apos;s weekly schedule and upcoming sessions.
          </p>
          {coaches.length === 0 ? (
            <p className="mt-6 text-sm text-[#56585e]">No coaches yet.</p>
          ) : (
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {coaches.map((coach) => (
                <li key={coach.id}>
                  <Link
                    href={`/admin/coaches/${coach.id}`}
                    className="block rounded-lg border border-[#e3e3e3] px-4 py-3 text-sm font-semibold transition hover:border-[#673de6] hover:shadow-sm"
                  >
                    {coach.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[#e3e3e3] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">Personas and profiles</h2>
            <Link href="/admin/personas" className="text-sm font-semibold text-[#5025d1] underline">
              Manage Personas
            </Link>
          </div>
          <p className="mt-1 text-sm text-[#56585e]">
            Edit a person&apos;s public name, photo, bio, and social links.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {personaOrder.map((persona) => {
              const list = effectiveProfilesByPersona[persona] ?? [];
              const pending = list.filter((p) => p.status === "pending").length;

              return (
                <div
                  key={persona}
                  className="rounded-lg border border-[#e3e3e3] bg-white px-4 py-4 transition hover:border-[#673de6] hover:shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <Link
                      href={`/admin/profiles/manage?persona=${encodeURIComponent(persona)}`}
                      className="block flex-1"
                    >
                      <div>
                        <h3 className="text-sm font-semibold">
                          {PERSONA_LABELS[persona] ?? persona}
                        </h3>
                        <p className="mt-1 text-sm text-[#56585e]">
                          {list.length} {list.length === 1 ? "member" : "members"}
                        </p>
                      </div>
                    </Link>

                    {pending > 0 ? (
                      <div className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                        {pending} approval{pending === 1 ? "" : "s"} needed
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-8">
        {stats.pendingProfiles > 0 && (
          <Link
            href="/admin/profiles"
            className="inline-flex min-h-11 items-center gap-3 rounded-[50px] border border-[#c9c9c9] px-6 text-sm font-semibold text-[#56585e] transition-colors hover:border-[#1a1a1a] hover:text-[#1a1a1a]"
          >
            Review profiles
            <span className="inline-flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
              {stats.pendingProfiles} to review
            </span>
          </Link>
        )}
      </div>

      <p className="mt-8 text-sm text-[#56585e]">
        {stats.publishedProfiles} approved public{' '}
        {stats.publishedProfiles === 1 ? 'profile is' : 'profiles are'}{' '}
        currently stored
        {stats.pendingProfiles > 0 &&
          `, and ${stats.pendingProfiles} ${stats.pendingProfiles === 1 ? 'profile is' : 'profiles are'} waiting for review`}
        .
      </p>
    </div>
  );
}
