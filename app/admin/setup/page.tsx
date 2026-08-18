import type { Metadata } from "next";
import Link from "next/link";
import BootstrapAdminForm from "./BootstrapAdminForm";
import { getCurrentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { hasAnyAdmin } from "@/lib/persona-admin";

export const metadata: Metadata = {
  title: "Set up administrator",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminSetupPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <h1 className="text-3xl font-semibold">Sign in before admin setup</h1>
        <p className="mt-4 max-w-xl text-[#56585e]">
          The setup code promotes the signed-in account. Sign in with the
          Google account that should become the first administrator.
        </p>
        <Link
          href="/api/auth/login"
          className="mt-6 inline-flex min-h-11 items-center rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white"
        >
          Sign in with Google
        </Link>
      </div>
    );
  }

  if (await hasAnyAdmin(await getDb())) {
    const isAdmin = user.personas.includes("admin");
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <h1 className="text-3xl font-semibold">Admin setup is complete</h1>
        <p className="mt-4 max-w-xl text-[#56585e]">
          {isAdmin
            ? "Your account already has administrator access."
            : "An administrator already exists. Ask an existing administrator to grant access from Manage people."}
        </p>
        {isAdmin && (
          <Link
            href="/admin"
            className="mt-6 inline-flex min-h-11 items-center rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white"
          >
            Open admin dashboard
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#673de6]">
        One-time setup
      </p>
      <h1 className="mt-2 text-3xl font-semibold md:text-4xl">
        Create the first administrator
      </h1>
      <p className="mt-4 max-w-xl text-[#56585e]">
        You are signed in as {user.email ?? user.displayName ?? "this account"}.
        Enter the secret setup code to grant this account the admin persona.
        Once one admin exists, this setup route cannot grant another.
      </p>
      <BootstrapAdminForm />
    </div>
  );
}
