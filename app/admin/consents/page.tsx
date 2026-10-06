import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireAdminUser } from "@/lib/persona-admin";
import { listMinorConsents, type MinorConsentAdminRow } from "@/lib/consent";

export const metadata: Metadata = {
  title: "Minor consents",
  robots: { index: false, follow: false },
};

// Reads the caller's session cookie, so it can never be statically rendered.
export const dynamic = "force-dynamic";

export default async function ConsentsAdminPage() {
  const db = await getDb();

  let consents: MinorConsentAdminRow[];
  try {
    const { headers } = await import("next/headers");
    const requestHeaders = await headers();
    await requireAdminUser(
      db,
      new Request("https://radtrails.org/admin/consents", { headers: requestHeaders }),
    );
    consents = await listMinorConsents(db);
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <h1 className="text-3xl font-semibold">Not available</h1>
        <p className="mt-4 text-white/55">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-3xl font-semibold md:text-4xl">Minor Consents</h1>
          <p className="mt-4 max-w-2xl text-white/55">
            Parent/guardian e-signatures on file for riders under 18. The typed signature plus the timestamp are the
            record of consent; the version pins which disclosure text was agreed to.
          </p>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-[#a8bd6a] underline">
          Admin dashboard
        </Link>
      </div>

      {consents.length === 0 ? (
        <p className="mt-10 text-white/55">No consents on file yet.</p>
      ) : (
        <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/55">
              <tr>
                <th className="px-4 py-3 font-semibold">Rider</th>
                <th className="px-4 py-3 font-semibold">Guardian</th>
                <th className="px-4 py-3 font-semibold">Relationship</th>
                <th className="px-4 py-3 font-semibold">Signature</th>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Signed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {consents.map((c) => (
                <tr key={c.userId} className="text-white/80">
                  <td className="px-4 py-3 font-medium text-white">{c.minorName}</td>
                  <td className="px-4 py-3">{c.guardianName}</td>
                  <td className="px-4 py-3 text-white/55">{c.guardianRelationship}</td>
                  <td className="px-4 py-3 italic text-white/55">{c.signature}</td>
                  <td className="px-4 py-3 text-white/55">{c.email ?? `user #${c.userId}`}</td>
                  <td className="px-4 py-3 text-white/55">
                    {new Date(c.agreedAt + "Z").toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
