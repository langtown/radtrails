import type { Metadata } from "next";
import Link from "next/link";
import AdminDashboard from "./AdminDashboard";
import { getCurrentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import {
  getAdminDashboardStats,
  hasAnyAdmin,
} from "@/lib/persona-admin";

export const metadata: Metadata = {
  title: "Admin dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function AccessPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <div className="mt-4 max-w-xl text-[#56585e]">{children}</div>
    </div>
  );
}

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <AccessPage title="Admin sign-in required">
        <p>Sign in with the Google account used to administer Radtrails.</p>
        <Link
          href="/api/auth/login"
          className="mt-6 inline-flex min-h-11 items-center rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white"
        >
          Sign in with Google
        </Link>
      </AccessPage>
    );
  }

  const db = await getDb();
  if (!user.personas.includes("admin")) {
    if (!(await hasAnyAdmin(db))) {
      return (
        <AccessPage title="Set up the first administrator">
          <p>
            No administrator exists yet. Use the one-time setup code to make
            this signed-in account the initial administrator.
          </p>
          <Link
            href="/admin/setup"
            className="mt-6 inline-flex min-h-11 items-center rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white"
          >
            Continue admin setup
          </Link>
        </AccessPage>
      );
    }

    return (
      <AccessPage title="Not available">
        <p>You do not have access to the admin dashboard.</p>
      </AccessPage>
    );
  }

  return (
    <AdminDashboard stats={await getAdminDashboardStats(db, user.id)} />
  );
}
