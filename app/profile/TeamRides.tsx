"use client";

import { useState } from "react";
import { SESSION_TYPE_LABELS } from "@/lib/coaching-constraints";
import type { TeamEvent } from "@/lib/team-events";

export type TeamRideWithRsvp = TeamEvent & { viewerUnavailable: boolean };

/**
 * The rider's team-ride list: meetup details plus the "not available"
 * opt-out. Everyone is attending by default; the toggle records an absence.
 */
export default function TeamRides({
  initialRides,
  canRsvp,
}: {
  initialRides: TeamRideWithRsvp[];
  /** Only accounts holding a schedulable persona (theteam) can RSVP. */
  canRsvp: boolean;
}) {
  const [rides, setRides] = useState(initialRides);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setUnavailable(rideId: number, unavailable: boolean) {
    setBusyId(rideId);
    setError(null);
    try {
      const response = await fetch(
        `/api/me/team-events/${rideId}/availability`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unavailable }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "That could not be saved.");
      }
      setRides((prev) =>
        prev.map((ride) =>
          ride.id === rideId ? { ...ride, viewerUnavailable: unavailable } : ride,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  if (rides.length === 0) return null;

  return (
    <section className="mt-10 border-t border-[#e3e3e3] pt-8">
      <h2 className="text-xl font-semibold">Group Rides</h2>
      <p className="mt-1 text-sm text-[#56585e]">
        {canRsvp
          ? "You are assumed attending. Mark yourself not available if you cannot make a ride."
          : "Team riders are assumed attending unless they mark themselves not available."}
      </p>
      {error && (
        <p className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <ul className="mt-4 divide-y divide-[#e3e3e3]">
        {rides.map((ride) => (
          <li key={ride.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="flex-1">
              <span className="font-medium">
                {SESSION_TYPE_LABELS.practiceride}
              </span>{" "}
              — {ride.eventDate}{" "}
              {ride.startTime}–{ride.finishTime} with Coach{" "}
              {ride.coachDisplayName ?? ""} · {ride.attendees.length} attending
              <a
                href={ride.locationUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-sm font-semibold text-[#5025d1] underline"
              >
                Meetup map
              </a>
              <span className="mt-1 block text-sm text-[#56585e]">
                Going:{" "}
                {ride.attendees
                  .map((attendee) => attendee.displayName ?? `Rider #${attendee.id}`)
                  .join(", ")}
                {ride.absentees.length > 0 && (
                  <>
                    {" "}
                    · Not going:{" "}
                    {ride.absentees
                      .map(
                        (absentee) => absentee.displayName ?? `Rider #${absentee.id}`,
                      )
                      .join(", ")}
                  </>
                )}
              </span>
            </span>
            {canRsvp &&
              (ride.viewerUnavailable ? (
                <button
                  type="button"
                  disabled={busyId === ride.id}
                  onClick={() => setUnavailable(ride.id, false)}
                  className="min-h-11 rounded-[50px] border border-[#c9c9c9] px-5 text-sm font-semibold text-[#56585e] disabled:opacity-50"
                >
                  {busyId === ride.id ? "Saving…" : "Back in"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyId === ride.id}
                  onClick={() => setUnavailable(ride.id, true)}
                  className="min-h-11 rounded-[50px] border border-red-300 px-5 text-sm font-semibold text-red-700 disabled:opacity-50"
                >
                  {busyId === ride.id ? "Saving…" : "Not available"}
                </button>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
