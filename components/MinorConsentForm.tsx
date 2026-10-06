"use client";

import { useEffect, useState } from "react";
import { MINOR_CONSENT_DISCLOSURE, GUARDIAN_RELATIONSHIPS } from "@/lib/content/consent";

type ConsentRecord = {
  minorName: string;
  guardianName: string;
  guardianRelationship: string;
  agreedAt: string;
};

const inputClass =
  "mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-[#0e0e14] px-3 py-2 text-white outline-none transition placeholder:text-white/40 focus:border-[#a8bd6a] focus:ring-2 focus:ring-[#a8bd6a]/40";

export default function MinorConsentForm() {
  const [loading, setLoading] = useState(true);
  const [onFile, setOnFile] = useState<ConsentRecord | null>(null);
  const [open, setOpen] = useState(false);

  const [minorName, setMinorName] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [relationship, setRelationship] = useState<string>(GUARDIAN_RELATIONSHIPS[0]);
  const [signature, setSignature] = useState("");
  const [agree, setAgree] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/me/consent", { cache: "no-store", credentials: "same-origin" });
        if (active && res.ok) {
          const data = (await res.json()) as { consent: ConsentRecord | null };
          setOnFile(data.consent);
        }
      } catch {
        // leave as not-on-file
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/me/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          minorName,
          guardianName,
          guardianRelationship: relationship,
          signature,
          agree,
        }),
      });
      const data = (await res.json()) as { consent?: ConsentRecord; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save consent.");
      setOnFile(data.consent ?? null);
      setOpen(false);
      setSignature("");
      setAgree(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save consent.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
      <h2 className="display text-2xl font-bold">Parental consent</h2>
      <p className="mt-2 text-sm leading-relaxed text-white/55">
        Required for riders under 18 before their name, photo, or bio is published. A parent or guardian completes and
        e-signs this once.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-white/40">Loading…</p>
      ) : onFile ? (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-[#a8bd6a]/30 bg-[#a8bd6a]/10 px-4 py-3 text-sm text-white/80">
            <span aria-hidden>✓</span>
            <span>
              On file — signed by <strong className="text-white">{onFile.guardianName}</strong> (
              {onFile.guardianRelationship.toLowerCase()}) on {new Date(onFile.agreedAt + "Z").toLocaleDateString()}.
            </span>
          </div>
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-sm font-semibold text-[#a8bd6a] hover:underline"
            >
              Update consent
            </button>
          )}
        </div>
      ) : (
        !open && (
          <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm text-white/80">
            <input
              type="checkbox"
              checked={open}
              onChange={(e) => setOpen(e.target.checked)}
              className="h-4 w-4 accent-[#a8bd6a]"
            />
            This rider is under 18
          </label>
        )
      )}

      {open && (
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="minor-name" className="text-sm font-medium text-white/80">Rider&apos;s full name</label>
              <input id="minor-name" value={minorName} onChange={(e) => setMinorName(e.target.value)} required maxLength={120} className={inputClass} />
            </div>
            <div>
              <label htmlFor="guardian-name" className="text-sm font-medium text-white/80">Parent / guardian name</label>
              <input id="guardian-name" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} required maxLength={120} className={inputClass} />
            </div>
          </div>

          <div>
            <label htmlFor="relationship" className="text-sm font-medium text-white/80">Relationship to rider</label>
            <select id="relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inputClass}>
              {GUARDIAN_RELATIONSHIPS.map((r) => (
                <option key={r} value={r} className="bg-[#0e0e14]">{r}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 rounded-lg border border-white/10 bg-[#0e0e14] p-4 text-sm leading-relaxed text-white/60">
            {MINOR_CONSENT_DISCLOSURE.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>

          <div>
            <label htmlFor="signature" className="text-sm font-medium text-white/80">
              Type your full name as your electronic signature
            </label>
            <input id="signature" value={signature} onChange={(e) => setSignature(e.target.value)} required maxLength={120} placeholder="Parent / guardian full name" className={inputClass} />
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-white/80">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required className="mt-0.5 h-4 w-4 accent-[#a8bd6a]" />
            I am the parent/legal guardian and I agree to the statement above.
          </label>

          {error && <p className="text-sm text-[#ff8a8a]">{error}</p>}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 items-center rounded-full bg-white px-7 text-sm font-semibold text-[#08080a] transition-transform duration-300 hover:-translate-y-0.5 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Sign & save consent"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-white/60 hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
