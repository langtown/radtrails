"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { UserWithPersonas } from "@/lib/persona-admin";

export default function PersonaTable({
  users,
  personaKeys,
}: {
  users: UserWithPersonas[];
  personaKeys: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle(userId: number, persona: string, held: boolean) {
    setError(null);

    const response = await fetch(`/api/admin/users/${userId}/personas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona,
        action: held ? "revoke" : "grant",
      }),
    });

    if (!response.ok) {
      // The server refuses some changes on purpose — notably removing the last
      // admin — so surface its reason rather than a generic failure.
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(body.error ?? "That change was not applied.");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-10">
      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#e3e3e3]">
              <th className="py-3 pr-4 font-semibold">Person</th>
              {personaKeys.map((persona) => (
                <th key={persona} className="px-3 py-3 font-semibold">
                  {persona}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-[#f0f0f0]">
                <td className="py-3 pr-4">
                  <span className="block font-medium">
                    {user.displayName ?? "(no name)"}
                  </span>
                  <span className="block text-[#56585e]">
                    {user.email ?? "(no email)"}
                  </span>
                </td>
                {personaKeys.map((persona) => {
                  const held = user.personas.includes(
                    persona as UserWithPersonas["personas"][number],
                  );

                  return (
                    <td key={persona} className="px-3 py-3">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => toggle(user.id, persona, held)}
                        className={`min-h-9 rounded-[50px] px-4 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          held
                            ? "bg-[#1a1a1a] text-white hover:bg-black"
                            : "border border-[#c9c9c9] text-[#56585e] hover:border-[#1a1a1a]"
                        }`}
                      >
                        {held ? "Yes" : "No"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <p className="mt-6 text-[#56585e]">No accounts yet.</p>
      )}
    </div>
  );
}
