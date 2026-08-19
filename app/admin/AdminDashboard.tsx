import Link from "next/link";
import type { AdminDashboardStats } from "@/lib/persona-admin";

export default function AdminDashboard({
  stats,
}: {
  stats: AdminDashboardStats;
}) {
  const sections = [
    {
      href: "/admin/profiles/manage",
      title: "Profiles",
      count: stats.users,
      countLabel: stats.users === 1 ? "signed-in account" : "signed-in accounts",
      description:
        "Browse people by persona, edit public names, photos, bios, and social links, and control where each person appears on the site.",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-[#673de6]">
          Administration
        </p>
        <h1 className="mt-2 text-3xl font-semibold md:text-4xl">
          Admin dashboard
        </h1>
        <p className="mt-4 max-w-2xl text-[#56585e]">
          Manage member profiles and control where each person appears on the
          site.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-xl border border-[#e3e3e3] bg-white p-6 shadow-sm transition hover:border-[#673de6] hover:shadow-md"
          >
            <p className="text-4xl font-semibold text-[#673de6]">
              {section.count}
            </p>
            <p className="mt-1 text-sm text-[#56585e]">
              {section.countLabel}
            </p>
            <h2 className="mt-6 text-xl font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#56585e]">
              {section.description}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <Link
          href="/admin/coaches"
          className="inline-flex min-h-11 items-center rounded-[50px] border border-[#c9c9c9] px-6 text-sm font-semibold text-[#56585e] transition-colors hover:border-[#1a1a1a] hover:text-[#1a1a1a]"
        >
          Manage coach calendars
        </Link>
      </div>

      <p className="mt-8 text-sm text-[#56585e]">
        {stats.publishedProfiles} approved public{" "}
        {stats.publishedProfiles === 1 ? "profile is" : "profiles are"}{" "}
        currently stored
        {stats.pendingProfiles > 0 &&
          `, and ${stats.pendingProfiles} ${stats.pendingProfiles === 1 ? "profile is" : "profiles are"} waiting for review`}
        .
      </p>
    </div>
  );
}
