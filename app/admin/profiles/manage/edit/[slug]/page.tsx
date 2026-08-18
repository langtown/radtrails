"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProfileEdit({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      setError(null);
      try {
        const res = await fetch(`/api/admin/profiles/${slug}`);
        if (!res.ok) throw new Error("not found");
        const body = (await res.json()) as { profile?: any };
        setProfile(body.profile);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
  }, [slug]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!profile) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:px-8">
      <h1 className="text-3xl font-semibold">Edit {profile.displayName}</h1>
      <p className="mt-4 text-sm text-[#56585e]">This editor supports changing display name, bio, image, socials, and personas. Submit to update the profile and publish changes.</p>

      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const form = new FormData(e.currentTarget as HTMLFormElement);
          const payload: any = {
            displayName: form.get('displayName') as string,
            bio: form.get('bio') as string,
            imageKey: null,
            imagePosition: form.get('imagePosition') as string,
            socials: {},
          };
          // collect socials
          const socialKeys = ['instagram','tiktok','twitter','youtube','facebook','strava','website'];
          for (const k of socialKeys) {
            const v = form.get(k);
            if (v) payload.socials[k] = v;
          }

          const res = await fetch(`/api/admin/profiles/${slug}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error('save failed');
          router.push('/admin/profiles/manage');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }}>
        <div>
          <label className="block text-sm font-semibold">Display name</label>
          <input name="displayName" defaultValue={profile.displayName} className="mt-2 w-full rounded-lg border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-semibold">Bio</label>
          <textarea name="bio" defaultValue={profile.bio ?? ''} className="mt-2 w-full rounded-lg border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-semibold">Image position</label>
          <input name="imagePosition" defaultValue={profile.imagePosition ?? ''} className="mt-2 w-full rounded-lg border px-3 py-2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(profile.socials ?? {}).map(([k, v]) => {
            const val = typeof v === 'string' ? v : '';
            return (
              <div key={k}>
                <label className="block text-sm font-semibold">{k}</label>
                <input name={k} defaultValue={val} className="mt-2 w-full rounded-lg border px-3 py-2" />
              </div>
            );
          })}
        </div>
        <div>
          <button className="mt-4 rounded-[50px] bg-[#1a1a1a] px-6 py-3 text-sm font-semibold text-white">Save</button>
        </div>
      </form>

      {error && <p className="mt-4 text-red-600">{error}</p>}
    </div>
  );
}
