import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export default function EditProfilePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:px-8">
      <h1 className="text-3xl font-semibold">Edit profile</h1>
      <p className="mt-4 text-sm text-[#56585e]">Use the in-page editor to change display name, bio, image, socials, and personas.</p>
      <p className="mt-6 text-sm">This editor will be implemented in a follow-up. For now, use the profile review or persona tools.</p>
      <Link href="/admin/profiles/manage" className="mt-6 inline-block text-sm text-[#5025d1] underline">Back</Link>
    </div>
  );
}
