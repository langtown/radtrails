import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { listUsersWithPersonas, requireAdminUser } from "@/lib/persona-admin";
import { PERSONA_KEYS } from "@/lib/personas";
import PersonaTable from "./PersonaTable";

export const metadata: Metadata = {
  title: "Manage personas",
  // An internal tool: keep it out of search results entirely.
  robots: { index: false, follow: false },
};

// Reads the caller's session cookie, so it can never be statically rendered.
export const dynamic = "force-dynamic";

export default async function PersonaAdminPage() {
  const db = await getDb();

  let users;
  try {
    const { headers } = await import("next/headers");
    const requestHeaders = await headers();
    await requireAdminUser(
      db,
      new Request("https://radtrails.org/admin/personas", {
        headers: requestHeaders,
      }),
    );
    users = await listUsersWithPersonas(db);
  } catch {
    // Deliberately identical for signed-out and non-admin visitors, so the
    // page never reveals which of the two a visitor is. The page title is
    // static and shared, so the route's existence is not itself hidden — the
    // account list and persona controls are what this protects.
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
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-3xl font-semibold md:text-4xl">
            Manage people
          </h1>
          <p className="mt-4 max-w-2xl text-[#56585e]">
            Personas decide whether and where someone appears on the site.
            Content review is separate: adding a rider to TheTeam does not
            publish a profile edit that has not been approved.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm font-semibold text-[#5025d1] underline"
        >
          Admin dashboard
        </Link>
      </div>

      <PersonaTable users={users} personaKeys={[...PERSONA_KEYS]} />
    </div>
  );
}
