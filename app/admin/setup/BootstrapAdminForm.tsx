"use client";

import { useState } from "react";
import {
  MAX_ADMIN_BOOTSTRAP_TOKEN_CHARACTERS,
  MIN_ADMIN_BOOTSTRAP_TOKEN_BYTES,
} from "@/lib/admin-bootstrap-constraints";

export default function BootstrapAdminForm() {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/bootstrap", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;

      if (!response.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Admin setup could not be completed.",
        );
      }

      window.location.assign("/admin");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Admin setup could not be completed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 max-w-xl">
      <label htmlFor="admin-setup-code" className="block text-sm font-semibold">
        One-time admin setup code
      </label>
      <input
        id="admin-setup-code"
        name="admin-setup-code"
        type="password"
        required
        minLength={MIN_ADMIN_BOOTSTRAP_TOKEN_BYTES}
        maxLength={MAX_ADMIN_BOOTSTRAP_TOKEN_CHARACTERS}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-lg border border-[#c9c9c9] px-3 py-2 outline-none focus:border-[#673de6] focus:ring-2 focus:ring-[#ebe4ff]"
      />
      <p className="mt-2 text-sm text-[#56585e]">
        This must match the secret stored as ADMIN_BOOTSTRAP_TOKEN. The code is
        never stored in D1.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
      >
        {submitting ? "Setting up…" : "Make this account the first admin"}
      </button>
    </form>
  );
}
