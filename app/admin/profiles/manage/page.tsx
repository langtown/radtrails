import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { requireAdminUser } from "@/lib/persona-admin";
import AdminProfilesManager from "./AdminProfilesManager";

export const metadata: Metadata = {
  title: "Manage profiles",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ManageProfilesPage() {
  const db = await getDb();

  try {
    await requireAdminUser(
      db,
      new Request("https://radtrails.org/admin/profiles/manage", {
        headers: await headers(),
      }),
    );
  } catch {
    // Deliberately identical for signed-out and non-admin visitors, so the
    // page never reveals which of the two a visitor is.
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
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-3xl font-semibold md:text-4xl">
            Manage profiles
          </h1>
          <p className="mt-4 max-w-2xl text-[#56585e]">
            Pick a persona to see everyone who holds it. Open a card to edit
            their public name, photo, bio, and links, or to change which
            personas the account holds. Saving an edit approves and publishes
            it immediately.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm font-semibold text-[#5025d1] underline"
        >
          Admin dashboard
        </Link>
      </div>

      <AdminProfilesManager />
    </div>
  );
}
