"use client";

import { useState, type FormEvent } from "react";

type Feedback = { kind: "error" | "success"; message: string } | null;

export default function PlaylistEditor({
  initialPlaylistUrl,
}: {
  initialPlaylistUrl: string | null;
}) {
  const [playlistUrl, setPlaylistUrl] = useState(initialPlaylistUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/me/playlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrl: playlistUrl.trim() || null }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "That link could not be saved.");
      }

      const body = (await response.json()) as { playlistUrl: string | null };
      setPlaylistUrl(body.playlistUrl ?? "");
      setFeedback({ kind: "success", message: "Playlist saved." });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "That link could not be saved.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-10 border-t border-[#e3e3e3] pt-8">
      <h2 className="text-xl font-semibold">Session playlist</h2>
      <p className="mt-1 text-sm text-[#56585e]">
        Leave a link for your coach to play during your Intervals session.
        This is separate from your public profile and takes effect
        immediately.
      </p>
      {feedback && (
        <p
          className={`mt-4 rounded border px-4 py-3 text-sm ${
            feedback.kind === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {feedback.message}
        </p>
      )}
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="url"
          name="playlistUrl"
          value={playlistUrl}
          onChange={(event) => setPlaylistUrl(event.target.value)}
          placeholder="https://open.spotify.com/playlist/..."
          maxLength={300}
          className="min-h-11 flex-1 rounded-lg border border-[#c9c9c9] px-3 py-2"
        />
        <button
          type="submit"
          disabled={isSaving}
          className="min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save playlist"}
        </button>
      </form>
    </section>
  );
}
