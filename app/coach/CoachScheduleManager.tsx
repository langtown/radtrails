"use client";

import { useState, type FormEvent } from "react";
import type { FtpZones } from "@/lib/athlete-ftp";
import { DAYS_OF_WEEK, SESSION_TYPES } from "@/lib/coaching-constraints";
import type { SessionOccurrence } from "@/lib/session-occurrences";
import type { WeeklyAssignment } from "@/lib/weekly-assignments";

type Rider = { id: number; displayName: string | null };

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "That change could not be saved.";
}

export default function CoachScheduleManager({
  coachId,
  initialAssignments,
  initialOccurrences,
  eligibleRiders,
}: {
  coachId: number;
  initialAssignments: WeeklyAssignment[];
  initialOccurrences: SessionOccurrence[];
  eligibleRiders: Rider[];
}) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [occurrences, setOccurrences] = useState(initialOccurrences);
  const [error, setError] = useState<string | null>(null);
  const [riderId, setRiderId] = useState<number | "">("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("17:00");
  const [ftpByRider, setFtpByRider] = useState<Record<number, FtpZones>>({});

  async function refresh() {
    const response = await fetch(`/api/coaches/${coachId}/schedule`);
    if (!response.ok) return;
    const body = (await response.json()) as {
      assignments: WeeklyAssignment[];
      occurrences: SessionOccurrence[];
    };
    setAssignments(body.assignments);
    setOccurrences(body.occurrences);
  }

  async function addAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (riderId === "") {
      setError("Choose a rider.");
      return;
    }

    const response = await fetch(`/api/coaches/${coachId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        riderId,
        sessionType: SESSION_TYPES[0],
        dayOfWeek,
        startTime,
        durationMinutes: 60,
      }),
    });

    if (!response.ok) {
      setError(await readError(response));
      return;
    }

    setRiderId("");
    await refresh();
  }

  async function removeAssignment(assignmentId: number) {
    setError(null);
    const response = await fetch(
      `/api/coaches/${coachId}/schedule/${assignmentId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    await refresh();
  }

  async function cancelOccurrence(occurrenceId: number) {
    setError(null);
    const response = await fetch(
      `/api/coaches/${coachId}/occurrences/${occurrenceId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      },
    );
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    await refresh();
  }

  async function rescheduleOccurrence(
    occurrenceId: number,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/coaches/${coachId}/occurrences/${occurrenceId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          occurrenceDate: String(data.get("occurrenceDate")),
          startTime: String(data.get("startTime")),
        }),
      },
    );
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    await refresh();
  }

  async function loadFtp(rider: number) {
    const response = await fetch(
      `/api/coaches/${coachId}/riders/${rider}/ftp?sessionType=${SESSION_TYPES[0]}`,
    );
    if (!response.ok) return;
    const zones = (await response.json()) as FtpZones;
    setFtpByRider((prev) => ({ ...prev, [rider]: zones }));
  }

  async function saveFtp(rider: number, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);

    const response = await fetch(`/api/coaches/${coachId}/riders/${rider}/ftp`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionType: SESSION_TYPES[0],
        z1Watts: Number(data.get("z1")),
        z2Watts: Number(data.get("z2")),
        z3Watts: Number(data.get("z3")),
        z4Watts: Number(data.get("z4")),
        z5Watts: Number(data.get("z5")),
      }),
    });

    if (!response.ok) {
      setError(await readError(response));
      return;
    }

    const saved = (await response.json()) as FtpZones;
    setFtpByRider((prev) => ({ ...prev, [rider]: saved }));
  }

  const scheduled = occurrences.filter((o) => o.status === "scheduled");

  return (
    <div className="mt-10">
      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <section>
        <h2 className="text-xl font-semibold">Weekly assignments</h2>
        <ul className="mt-4 divide-y divide-[#e3e3e3]">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex-1">
                {assignment.riderDisplayName ?? `Rider #${assignment.riderId}`} —{" "}
                {DAYS_OF_WEEK[assignment.dayOfWeek]} {assignment.startTime}
              </span>
              <button
                type="button"
                onClick={() => loadFtp(assignment.riderId)}
                className="text-sm font-semibold text-[#5025d1] underline"
              >
                FTP zones
              </button>
              <button
                type="button"
                onClick={() => removeAssignment(assignment.id)}
                className="text-sm font-semibold text-red-700 underline"
              >
                Remove
              </button>
              {ftpByRider[assignment.riderId] && (
                <form
                  onSubmit={(event) => saveFtp(assignment.riderId, event)}
                  className="flex w-full flex-wrap gap-2"
                >
                  {(["z1", "z2", "z3", "z4", "z5"] as const).map((zone, index) => (
                    <input
                      key={zone}
                      name={zone}
                      type="number"
                      min={1}
                      max={3000}
                      defaultValue={
                        ftpByRider[assignment.riderId][
                          `z${index + 1}Watts` as keyof FtpZones
                        ] ?? ""
                      }
                      placeholder={`Z${index + 1} watts`}
                      className="w-28 rounded border border-[#c9c9c9] px-2 py-1 text-sm"
                    />
                  ))}
                  <button
                    type="submit"
                    className="min-h-9 rounded-[50px] bg-[#1a1a1a] px-4 text-xs font-semibold text-white"
                  >
                    Save zones
                  </button>
                </form>
              )}
            </li>
          ))}
          {assignments.length === 0 && (
            <li className="py-3 text-[#56585e]">No riders scheduled yet.</li>
          )}
        </ul>

        <form onSubmit={addAssignment} className="mt-6 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Rider
            <select
              value={riderId}
              onChange={(event) =>
                setRiderId(event.target.value ? Number(event.target.value) : "")
              }
              className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
            >
              <option value="">Choose a rider</option>
              {eligibleRiders.map((rider) => (
                <option key={rider.id} value={rider.id}>
                  {rider.displayName ?? `Rider #${rider.id}`}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Day
            <select
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(Number(event.target.value))}
              className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
            >
              {DAYS_OF_WEEK.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Time
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white"
          >
            Add to calendar
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Upcoming sessions</h2>
        <ul className="mt-4 divide-y divide-[#e3e3e3]">
          {scheduled.map((occurrence) => (
            <li key={occurrence.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex-1">
                {occurrence.occurrenceDate} {occurrence.startTime} —{" "}
                {occurrence.riderDisplayName ?? `Rider #${occurrence.riderId}`}
                {occurrence.riderPlaylistUrl && (
                  <>
                    {" "}
                    —{" "}
                    <a
                      href={occurrence.riderPlaylistUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#5025d1] underline"
                    >
                      playlist
                    </a>
                  </>
                )}
              </span>
              <form
                onSubmit={(event) => rescheduleOccurrence(occurrence.id, event)}
                className="flex items-center gap-2"
              >
                <input
                  type="date"
                  name="occurrenceDate"
                  defaultValue={occurrence.occurrenceDate}
                  className="rounded border border-[#c9c9c9] px-2 py-1 text-sm"
                />
                <input
                  type="time"
                  name="startTime"
                  defaultValue={occurrence.startTime}
                  className="rounded border border-[#c9c9c9] px-2 py-1 text-sm"
                />
                <button
                  type="submit"
                  className="text-sm font-semibold text-[#5025d1] underline"
                >
                  Reschedule
                </button>
              </form>
              <button
                type="button"
                onClick={() => cancelOccurrence(occurrence.id)}
                className="text-sm font-semibold text-red-700 underline"
              >
                Cancel this date
              </button>
            </li>
          ))}
          {scheduled.length === 0 && (
            <li className="py-3 text-[#56585e]">No upcoming sessions.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
