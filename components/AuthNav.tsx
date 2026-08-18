"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export type AuthDisplayUser = {
  displayName: string | null;
  pictureUrl: string | null;
  isAdmin: boolean;
};

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: AuthDisplayUser };

/**
 * Treats /api/me as an untrusted serialization boundary and copies only the
 * display fields navigation needs plus a derived admin-navigation flag. Email,
 * raw persona lists, internal ids, Google claims, and session tokens never
 * enter this component's state.
 */
export function parseAuthDisplayUser(value: unknown): AuthDisplayUser | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const { displayName, pictureUrl } = record;
  if (
    (displayName !== null && typeof displayName !== "string") ||
    (pictureUrl !== null && typeof pictureUrl !== "string")
  ) {
    return null;
  }

  const isAdmin =
    Array.isArray(record.personas) &&
    record.personas.every((persona) => typeof persona === "string") &&
    record.personas.includes("admin");

  return { displayName, pictureUrl, isAdmin };
}

export function AuthControls({ state }: { state: AuthState }) {
  if (state.status === "loading") {
    return (
      <span
        aria-label="Checking sign-in status"
        className="h-5 w-24 animate-pulse rounded bg-[#f2f3f6]"
      />
    );
  }

  if (state.status === "signedOut") {
    // A plain anchor leaves the app for Google's authorization screen and
    // avoids client-side navigation or prefetching of the redirect endpoint.
    return (
      <a
        href="/api/auth/login"
        className="transition-colors hover:text-[#673de6]"
      >
        login
      </a>
    );
  }

  const label = state.user.displayName ?? "Profile";

  return (
    <div className="flex items-center gap-4">
      {state.user.isAdmin && (
        <Link
          href="/admin"
          className="transition-colors hover:text-[#673de6]"
        >
          Admin
        </Link>
      )}
      <Link
        href="/profile"
        aria-label={`Profile for ${label}`}
        className="flex items-center gap-2 transition-colors hover:text-[#673de6]"
      >
        {state.user.pictureUrl ? (
          <Image
            src={state.user.pictureUrl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <span className="inline-block h-7 w-7 rounded-full bg-[#f2f3f6]" aria-hidden="true" />
        )}
      </Link>
    </div>
  );
}

export default function AuthNav() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadAuthState() {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });

        if (response.status === 401) {
          setState({ status: "signedOut" });
          return;
        }

        if (!response.ok) throw new Error(`auth request failed (${response.status})`);

        const user = parseAuthDisplayUser(await response.json());
        setState(user ? { status: "signedIn", user } : { status: "signedOut" });
      } catch {
        if (!controller.signal.aborted) setState({ status: "signedOut" });
      }
    }

    void loadAuthState();
    return () => controller.abort();
  }, []);

  return <AuthControls state={state} />;
}
