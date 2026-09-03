import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { listUsersWithPersonas, requireAdminUser } from "@/lib/persona-admin";

export const metadata: Metadata = {
  title: "Manage coach calendars",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCoachesPage() {
  const db = await getDb();

  let coaches;
  try {
    const { headers } = await import("next/headers");
    const requestHeaders = await headers();
    await requireAdminUser(
      db,
      new Request("https://radtrails.org/admin/coaches", {
        headers: requestHeaders,
      }),
    );
    const users = await listUsersWithPersonas(db);
    coaches = users.filter((user) => user.personas.includes("coach"));
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <h1 className="text-3xl font-semibold">Not available</h1>
        <p className="mt-4 text-[#56585e]">
          You do not have access to this page.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <h1 className="text-3xl font-semibold md:text-4xl">Coach calendars</h1>
      <ul className="mt-8 divide-y divide-[#e3e3e3]">
        {coaches.map((coach) => (
          <li key={coach.id} className="py-3">
            <Link
              href={`/admin/coaches/${coach.id}`}
              className="text-sm font-semibold text-[#5025d1] underline"
            >
              {coach.displayName ?? coach.email ?? `Coach #${coach.id}`}
            </Link>
          </li>
        ))}
        {coaches.length === 0 && (
          <li className="py-3 text-[#56585e]">No coaches yet.</li>
        )}
      </ul>
    </div>
  );
}
