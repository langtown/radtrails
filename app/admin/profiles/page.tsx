import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { requireAdminUser } from "@/lib/persona-admin";
import { listPendingProfiles } from "@/lib/profile-review";
import ReviewQueue from "./ReviewQueue";

export const metadata: Metadata = {
  title: "Review profiles",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfileReviewPage() {
  const db = await getDb();

  let profiles;
  try {
    const actorId = await requireAdminUser(
      db,
      new Request("https://radtrails.org/admin/profiles", {
        headers: await headers(),
      }),
    );
    profiles = await listPendingProfiles(db, actorId);
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
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-3xl font-semibold md:text-4xl">
            Review profiles
          </h1>
          <p className="mt-4 max-w-2xl text-[#56585e]">
            Check the name, photo, bio, and social links exactly as they will
            appear. Rejections require feedback the profile owner can act on.
          </p>
        </div>
      </div>

      <ReviewQueue initialProfiles={profiles} />
    </div>
  );
}
