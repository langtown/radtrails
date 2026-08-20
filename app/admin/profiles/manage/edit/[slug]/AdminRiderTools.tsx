"use client";

import { useEffect, useState, type FormEvent } from "react";
import SessionsCalendar from "@/components/SessionsCalendar";
import { SESSION_TYPE_LABELS } from "@/lib/coaching-constraints";
import type { SessionOccurrence } from "@/lib/session-occurrences";

type Feedback = { kind: "error" | "success"; message: string } | null;

/**
 * Rider tools on the admin profile edit page: the rider's interval schedule
 * and their session playlist, both read and (for the playlist) written via
 * the admin API.
 */
export default function AdminRiderTools({ userId }: { userId: number }) {
  const [sessions, setSessions] = useState<SessionOccurrence[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistLoaded, setPlaylistLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/admin/users/${userId}/sessions`)
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return (await response.json()) as { sessions: SessionOccurrence[] };
      })
      .then((body) => {
        if (!cancelled) setSessions(body.sessions);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });

    fetch(`/api/admin/users/${userId}/playlist`)
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return (await response.json()) as { playlistUrl: string | null };
      })
      .then((body) => {
        if (cancelled) return;
        setPlaylistUrl(body.playlistUrl ?? "");
        setPlaylistLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setPlaylistLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function reloadSessions() {
    const response = await fetch(`/api/admin/users/${userId}/sessions`);
    if (!response.ok) return;
    const body = (await response.json()) as { sessions: SessionOccurrence[] };
    setSessions(body.sessions);
  }

  async function patchOccurrence(
    occurrence: SessionOccurrence,
    body: Record<string, unknown>,
  ) {
    const response = await fetch(
      `/api/coaches/${occurrence.coachId}/occurrences/${occurrence.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const parsed = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(parsed.error ?? "That change could not be saved.");
    }
    setEditingId(null);
    await reloadSessions();
  }

  async function rescheduleEditing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    try {
      await patchOccurrence(editing, {
        action: "reschedule",
        occurrenceDate: String(data.get("occurrenceDate")),
        startTime: String(data.get("startTime")),
      });
    } catch (cause) {
      setFeedback({
        kind: "error",
        message: cause instanceof Error ? cause.message : "Save failed.",
      });
    }
  }

  async function savePlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}/playlist`, {
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

  const editing =
    editingId === null
      ? null
      : ((sessions ?? []).find(
          (session) => session.id === editingId && session.status === "scheduled",
        ) ?? null);

  return (
    <>
      {sessions !== null && sessions.length > 0 && (
        <section className="mt-10 border-t border-[#e3e3e3] pt-8">
          <h2 className="text-xl font-semibold">Interval schedule</h2>
          <SessionsCalendar
            sessions={sessions}
            perspective="rider"
            onSelectSession={setEditingId}
          />
        </section>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setEditingId(null)}
        >
          <div
            role="dialog"
            aria-label="Edit session"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-xl font-semibold">Edit session</h3>
            <p className="mt-1 text-sm text-[#56585e]">
              {SESSION_TYPE_LABELS[editing.sessionType]} with Coach{" "}
              {editing.coachDisplayName ?? ""} — currently{" "}
              {editing.occurrenceDate} at {editing.startTime}
            </p>
            <form
              onSubmit={rescheduleEditing}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <label className="text-sm">
                Date
                <input
                  type="date"
                  name="occurrenceDate"
                  defaultValue={editing.occurrenceDate}
                  className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
                />
              </label>
              <label className="text-sm">
                Time
                <input
                  type="time"
                  name="startTime"
                  defaultValue={editing.startTime}
                  className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
                />
              </label>
              <button
                type="submit"
                className="min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white"
              >
                Save
              </button>
            </form>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  patchOccurrence(editing, { action: "cancel" }).catch(
                    (cause: Error) =>
                      setFeedback({ kind: "error", message: cause.message }),
                  )
                }
                className="min-h-11 rounded-[50px] border border-red-300 px-6 text-sm font-semibold text-red-700"
              >
                Cancel this date
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="min-h-11 rounded-[50px] border border-[#c9c9c9] px-6 text-sm font-semibold text-[#56585e]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mt-10 border-t border-[#e3e3e3] pt-8">
        <h2 className="text-xl font-semibold">Session playlist</h2>
        <p className="mt-1 text-sm text-[#56585e]">
          The link played during this rider&apos;s Intervals sessions. Takes
          effect immediately.
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
        {playlistLoaded && (
          <form
            onSubmit={savePlaylist}
            className="mt-4 flex flex-wrap items-center gap-3"
          >
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
        )}
      </section>
    </>
  );
}
