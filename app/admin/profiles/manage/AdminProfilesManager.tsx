"use client";

import { useEffect, useState } from "react";
import type { PublicProfile } from "@/lib/public-profiles";
import { PUBLIC_PROFILE_PERSONAS } from "@/lib/public-profiles";

function PersonaSelector({ persona, setPersona }: { persona: string; setPersona: (p: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm font-semibold">Persona</label>
      <select value={persona} onChange={(e) => setPersona(e.target.value)} className="rounded-lg border px-2 py-1">
        {PUBLIC_PROFILE_PERSONAS.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );
}

export default function AdminProfilesManager() {
  const [persona, setPersona] = useState(PUBLIC_PROFILE_PERSONAS[0]);
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setError(null);
      try {
        const res = await fetch(`/api/profiles?persona=${persona}`);
        if (!res.ok) throw new Error("Failed to load profiles");
        const body = (await res.json()) as { profiles?: PublicProfile[] };
        setProfiles(body.profiles ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
  }, [persona]);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <PersonaSelector persona={persona} setPersona={setPersona} />
      </div>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {profiles.map(p => (
          <article key={p.slug} className="rounded-lg border p-4">
            {p.image ? <img src={p.image} alt="" className="h-32 w-full object-cover rounded" /> : <div className="h-32 w-full bg-[#dadce0] rounded" />}
            <h3 className="mt-3 text-lg font-semibold">{p.name}</h3>
            <p className="text-sm text-[#56585e]">{p.bio ?? ""}</p>
            <div className="mt-3 flex gap-2">
              <a href={`/admin/profiles/manage/edit/${p.slug}`} className="text-sm text-[#5025d1] underline">Edit</a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
