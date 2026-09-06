"use client";

import { useState, type FormEvent } from "react";
import SessionsCalendar from "@/components/SessionsCalendar";
import { deriveZonesFromZone5 } from "@/lib/athlete-ftp";
import {
  ALL_DAYS_MASK,
  type BlackoutWindow,
  type BookableSessionType,
  type BookingWindows,
} from "@/lib/booking-windows";
import {
  DAYS_OF_WEEK,
  MAX_RIDERS_PER_SLOT,
  SESSION_TYPE_LABELS,
  ASSIGNMENT_TYPES,
  SESSION_TYPES,
  type SessionType,
} from "@/lib/coaching-constraints";
import type { SessionOccurrence } from "@/lib/session-occurrences";
import type { TeamEvent } from "@/lib/team-events";
import type { WeeklyAssignment } from "@/lib/weekly-assignments";

type Rider = { id: number; displayName: string | null };

/** Defaults when each blackout window checkbox is first checked: overnight, then late evening. */
const DEFAULT_BLACKOUT_WINDOWS: [BlackoutWindow, BlackoutWindow] = [
  { start: "00:00", end: "06:00" },
  { start: "20:00", end: "23:59" },
];

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "That change could not be saved.";
}

export default function CoachScheduleManager({
  coachId,
  initialAssignments,
  initialOccurrences,
  initialTeamEvents,
  initialBookingWindows,
  eligibleRiders,
  isAdmin = false,
}: {
  coachId: number;
  initialAssignments: WeeklyAssignment[];
  initialOccurrences: SessionOccurrence[];
  initialTeamEvents: TeamEvent[];
  initialBookingWindows: Record<BookableSessionType, BookingWindows | null>;
  eligibleRiders: Rider[];
  /** Admins get rider names linked to the admin profile edit page. */
  isAdmin?: boolean;
}) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [occurrences, setOccurrences] = useState(initialOccurrences);
  const [teamEvents, setTeamEvents] = useState(initialTeamEvents);
  const [bookingWindows, setBookingWindows] = useState(initialBookingWindows);
  const [teamDate, setTeamDate] = useState("");
  const [teamStart, setTeamStart] = useState("09:00");
  const [teamFinish, setTeamFinish] = useState("11:00");
  const [teamLocation, setTeamLocation] = useState("");
  const [teamInfo, setTeamInfo] = useState("");
  const [viewingTeamEventId, setViewingTeamEventId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riderId, setRiderId] = useState<number | "">("");
  const [sessionType, setSessionType] = useState<SessionType>(ASSIGNMENT_TYPES[0]);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [occurrenceDate, setOccurrenceDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [startTime, setStartTime] = useState("17:00");
  const [ftpEditingAssignment, setFtpEditingAssignment] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch(`/api/coaches/${coachId}/schedule`);
    if (!response.ok) return;
    const body = (await response.json()) as {
      assignments: WeeklyAssignment[];
      occurrences: SessionOccurrence[];
      teamEvents: TeamEvent[];
    };
    setAssignments(body.assignments);
    setOccurrences(body.occurrences);
    setTeamEvents(body.teamEvents);
  }

  function updateBookingWindows(
    sessionType: BookableSessionType,
    windows: BookingWindows,
  ) {
    setBookingWindows((current) => ({ ...current, [sessionType]: windows }));
  }

  async function removeTeamEvent(teamEventId: number) {
    setError(null);
    const response = await fetch(
      `/api/coaches/${coachId}/team-events/${teamEventId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    setViewingTeamEventId(null);
    await refresh();
  }

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (sessionType === "practiceride") {
      const response = await fetch(`/api/coaches/${coachId}/team-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventDate: teamDate,
          startTime: teamStart,
          finishTime: teamFinish,
          locationUrl: teamLocation,
          ...(teamInfo.trim() === "" ? {} : { info: teamInfo }),
        }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setTeamDate("");
      setTeamLocation("");
      setTeamInfo("");
      await refresh();
      return;
    }

    if (riderId === "") {
      setError("Choose a rider.");
      return;
    }

    const response = await fetch(`/api/coaches/${coachId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        riderId,
        sessionType,
        dayOfWeek,
        startTime,
        durationMinutes: 60,
        ...(sessionType === "lesson" ? { occurrenceDate } : {}),
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
    setEditingId(null);
    await refresh();
  }

  async function rescheduleOccurrence(
    occurrenceId: number,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    // Two submit buttons share this form; the one clicked sets "scope".
    const scope = String(data.get("scope") ?? "single");
    const response = await fetch(
      `/api/coaches/${coachId}/occurrences/${occurrenceId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: scope === "series" ? "reschedule-series" : "reschedule",
          occurrenceDate: String(data.get("occurrenceDate")),
          startTime: String(data.get("startTime")),
        }),
      },
    );
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function saveFtp(rider: number, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);

    const response = await fetch(`/api/coaches/${coachId}/riders/${rider}/ftp`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone5Watts: Number(data.get("ftp")) }),
    });

    if (!response.ok) {
      setError(await readError(response));
      return;
    }

    setFtpEditingAssignment(null);
    await refresh();
  }

  // "Upcoming" means scheduled and not in the past; the API also returns
  // recent history for the calendar. Site-local date from the browser.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const scheduled = occurrences.filter(
    (o) => o.status === "scheduled" && o.occurrenceDate >= todayIso,
  );

  // Group assignments into their shared slot: type + day (or date) + time.
  const slotKeyOf = (assignment: WeeklyAssignment) =>
    `${assignment.sessionType}|${assignment.dayOfWeek}|${assignment.startTime}|${
      assignment.oneOff ? (assignment.occurrenceDate ?? "") : ""
    }`;
  const slotGroups: WeeklyAssignment[][] = [];
  for (const assignment of assignments) {
    const key = slotKeyOf(assignment);
    const group = slotGroups.find(
      (candidate) => slotKeyOf(candidate[0]) === key,
    );
    if (group) group.push(assignment);
    else slotGroups.push([assignment]);
  }
  const editing =
    editingId === null
      ? null
      : (occurrences.find((o) => o.id === editingId && o.status === "scheduled") ??
        null);
  const viewingTeamEvent =
    viewingTeamEventId === null
      ? null
      : (teamEvents.find((event) => event.id === viewingTeamEventId) ?? null);

  function isDayAllowed(dateIso: string, windows: BookingWindows | null): boolean {
    if (!windows) return true;
    const day = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
    return ((windows.allowedDaysMask >> day) & 1) === 1;
  }

  // Booking rules only ever apply to Intervals and Lesson bookings; practice
  // rides are never restricted by them.
  const activeBookingWindows =
    sessionType === "intervals"
      ? bookingWindows.intervals
      : sessionType === "lesson"
        ? bookingWindows.lesson
        : null;

  // The two blackout windows are meant to bookend the day (overnight, late
  // evening); a window anchored at midnight/day-end clamps the Time input's
  // native min/max to the gap between them.
  let timeMin: string | undefined;
  let timeMax: string | undefined;
  for (const blackout of activeBookingWindows?.blackouts ?? []) {
    if (blackout.start === "00:00" && (!timeMin || blackout.end > timeMin)) {
      timeMin = blackout.end;
    }
    if (blackout.end === "23:59" && (!timeMax || blackout.start < timeMax)) {
      timeMax = blackout.start;
    }
  }

  const lessonDateInvalid =
    sessionType === "lesson" && !isDayAllowed(occurrenceDate, bookingWindows.lesson);

  return (
    <div className="mt-10">
      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <SessionsCalendar
        sessions={occurrences}
        perspective="coach"
        onSelectSession={setEditingId}
        teamEvents={teamEvents}
        onSelectTeamEvent={setViewingTeamEventId}
      />

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Add to calendar</h2>
        <form onSubmit={addEntry} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Type
            <select
              value={sessionType}
              onChange={(event) =>
                setSessionType(event.target.value as SessionType)
              }
              className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
            >
              {SESSION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SESSION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          {sessionType !== "practiceride" && (
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
          )}
          {sessionType === "practiceride" ? (
            <label className="text-sm">
              Date
              <input
                type="date"
                required
                value={teamDate}
                onChange={(event) => setTeamDate(event.target.value)}
                className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
              />
            </label>
          ) : sessionType === "lesson" ? (
            <label className="text-sm">
              Date
              <input
                type="date"
                required
                value={occurrenceDate}
                onChange={(event) => setOccurrenceDate(event.target.value)}
                className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
              />
              {lessonDateInvalid && (
                <span className="mt-1 block text-xs font-semibold text-red-700">
                  {DAYS_OF_WEEK[new Date(`${occurrenceDate}T00:00:00Z`).getUTCDay()]}{" "}
                  is not a bookable day.
                </span>
              )}
            </label>
          ) : (
            <label className="text-sm">
              Day
              <select
                value={dayOfWeek}
                onChange={(event) => setDayOfWeek(Number(event.target.value))}
                className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
              >
                {DAYS_OF_WEEK.map((day, index) => (
                  <option
                    key={day}
                    value={index}
                    disabled={
                      bookingWindows.intervals !== null &&
                      ((bookingWindows.intervals.allowedDaysMask >> index) & 1) === 0
                    }
                  >
                    {day}
                  </option>
                ))}
              </select>
            </label>
          )}
          {sessionType === "practiceride" ? (
            <>
              <label className="text-sm">
                Start
                <input
                  type="time"
                  required
                  value={teamStart}
                  onChange={(event) => setTeamStart(event.target.value)}
                  className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
                />
              </label>
              <label className="text-sm">
                Finish
                <input
                  type="time"
                  required
                  value={teamFinish}
                  onChange={(event) => setTeamFinish(event.target.value)}
                  className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
                />
              </label>
            </>
          ) : (
            <label className="text-sm">
              Time
              <input
                type="time"
                min={timeMin}
                max={timeMax}
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
              />
            </label>
          )}
          {sessionType === "practiceride" && (
            <>
              <label className="text-sm">
                Meetup (Google Maps link)
                <input
                  type="url"
                  required
                  value={teamLocation}
                  onChange={(event) => setTeamLocation(event.target.value)}
                  placeholder="https://maps.app.goo.gl/..."
                  className="mt-1 block min-h-11 w-64 rounded border border-[#c9c9c9] px-3"
                />
              </label>
              <label className="text-sm">
                Info
                <input
                  type="text"
                  value={teamInfo}
                  onChange={(event) => setTeamInfo(event.target.value)}
                  placeholder="Route notes, pace, what to bring"
                  className="mt-1 block min-h-11 w-64 rounded border border-[#c9c9c9] px-3"
                />
              </label>
            </>
          )}
          <button
            type="submit"
            disabled={lessonDateInvalid}
            className="min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to calendar
          </button>
        </form>
      </section>

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
              {SESSION_TYPE_LABELS[editing.sessionType]} with{" "}
              {editing.riderDisplayName ?? `Rider #${editing.riderId}`} —
              currently {editing.occurrenceDate} at {editing.startTime}
            </p>
            {editing.sessionType === "intervals" && (
              <p className="mt-2 text-xs text-[#56585e]">
                Pick a new date and time, then choose whether it applies to
                just this date or to every future Intervals session in this
                rider&apos;s weekly series.
              </p>
            )}
            <form
              onSubmit={(event) => rescheduleOccurrence(editing.id, event)}
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
                name="scope"
                value="single"
                className="min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white"
              >
                Save this date
              </button>
              {editing.sessionType === "intervals" && (
                <button
                  type="submit"
                  name="scope"
                  value="series"
                  className="min-h-11 rounded-[50px] border border-[#1a1a1a] px-6 text-sm font-semibold text-[#1a1a1a]"
                >
                  Save this and future sessions
                </button>
              )}
            </form>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => cancelOccurrence(editing.id)}
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

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Intervals</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {slotGroups.map((group) => {
            const slot = group[0];
            return (
              <div
                key={slotKeyOf(slot)}
                className="rounded-xl border border-[#e3e3e3] p-4"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#56585e]">
                    {SESSION_TYPE_LABELS[slot.sessionType]} ·{" "}
                    {slot.oneOff && slot.occurrenceDate
                      ? slot.occurrenceDate
                      : DAYS_OF_WEEK[slot.dayOfWeek]}{" "}
                    {slot.startTime}
                  </h3>
                  <span className="text-xs text-[#56585e]">
                    {group.length}/{MAX_RIDERS_PER_SLOT} riders
                  </span>
                </div>
                <ul className="mt-3 divide-y divide-[#e3e3e3]">
                  {group.map((assignment) => {
                    const riderName =
                      assignment.riderDisplayName ?? `Rider #${assignment.riderId}`;
                    const zones =
                      assignment.riderZone5Watts !== null
                        ? deriveZonesFromZone5(assignment.riderZone5Watts).zones
                        : null;
                    return (
                      <li key={assignment.id} className="py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="flex-1">
                            {isAdmin && assignment.riderSlug ? (
                              <a
                                href={`/admin/profiles/manage/edit/${assignment.riderSlug}`}
                                className="font-semibold text-[#5025d1] underline"
                              >
                                {riderName}
                              </a>
                            ) : (
                              <span className="font-semibold">{riderName}</span>
                            )}
                            {assignment.riderZone5Watts !== null &&
                              ` · Z5 ${assignment.riderZone5Watts} W`}
                            {zones && (
                              <span className="block text-xs text-[#56585e]">
                                {zones
                                  .map(
                                    (zone) =>
                                      `${zone.zone} ${
                                        zone.minWatts === null
                                          ? `\u2264${zone.maxWatts}`
                                          : zone.maxWatts === null
                                            ? `${zone.minWatts}+`
                                            : `${zone.minWatts}\u2013${zone.maxWatts}`
                                      }`,
                                  )
                                  .join(" · ")}{" "}
                                W
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setFtpEditingAssignment(
                                ftpEditingAssignment === assignment.id
                                  ? null
                                  : assignment.id,
                              )
                            }
                            className="text-sm font-semibold text-[#5025d1] underline"
                          >
                            Set FTP
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAssignment(assignment.id)}
                            className="text-sm font-semibold text-red-700 underline"
                          >
                            Remove
                          </button>
                        </div>
                        {ftpEditingAssignment === assignment.id && (
                          <form
                            onSubmit={(event) => saveFtp(assignment.riderId, event)}
                            className="mt-2 flex flex-wrap items-center gap-2"
                          >
                            <input
                              name="ftp"
                              type="number"
                              min={1}
                              max={3000}
                              defaultValue={assignment.riderZone5Watts ?? ""}
                              placeholder="Zone 5 watts"
                              className="w-32 rounded border border-[#c9c9c9] px-2 py-1 text-sm"
                            />
                            <button
                              type="submit"
                              className="min-h-9 rounded-[50px] bg-[#1a1a1a] px-4 text-xs font-semibold text-white"
                            >
                              Save
                            </button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        {assignments.length === 0 && (
          <p className="mt-4 text-[#56585e]">No riders scheduled yet.</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Booking rules</h2>
        <p className="mt-1 text-sm text-[#56585e]">
          Choose which days can be booked and up to two blackout windows that
          apply on every allowed day, set separately for Intervals and
          Lessons. Group Rides are never restricted by these rules. Leave
          every day on and both windows off to allow anything.
        </p>
        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <BookingRulesEditor
            coachId={coachId}
            sessionType="intervals"
            label="Intervals"
            initialWindows={bookingWindows.intervals}
            onSaved={(windows) => updateBookingWindows("intervals", windows)}
          />
          <BookingRulesEditor
            coachId={coachId}
            sessionType="lesson"
            label="Lessons"
            initialWindows={bookingWindows.lesson}
            onSaved={(windows) => updateBookingWindows("lesson", windows)}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Group Rides</h2>
        <p className="mt-1 text-sm text-[#56585e]">
          One event on every team rider&apos;s calendar. Riders mark
          themselves not available from their profile; everyone else is
          assumed attending.
        </p>
        <ul className="mt-4 divide-y divide-[#e3e3e3]">
          {teamEvents.map((teamEvent) => (
            <li key={teamEvent.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex-1">
                {teamEvent.eventDate} {teamEvent.startTime}–{teamEvent.finishTime}{" "}
                — {teamEvent.attendees.length} attending
                {teamEvent.absentees.length > 0 &&
                  `, ${teamEvent.absentees.length} not available`}
              </span>
              <a
                href={teamEvent.locationUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-[#5025d1] underline"
              >
                Meetup map
              </a>
              <button
                type="button"
                onClick={() => setViewingTeamEventId(teamEvent.id)}
                className="text-sm font-semibold text-[#5025d1] underline"
              >
                Attendees
              </button>
              <button
                type="button"
                onClick={() => removeTeamEvent(teamEvent.id)}
                className="text-sm font-semibold text-red-700 underline"
              >
                Remove
              </button>
            </li>
          ))}
          {teamEvents.length === 0 && (
            <li className="py-3 text-[#56585e]">No team rides scheduled.</li>
          )}
        </ul>
      </section>

      {viewingTeamEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setViewingTeamEventId(null)}
        >
          <div
            role="dialog"
            aria-label="Group Ride attendees"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-xl font-semibold">
              {SESSION_TYPE_LABELS.practiceride}
            </h3>
            <p className="mt-1 text-sm text-[#56585e]">
              {viewingTeamEvent.eventDate} {viewingTeamEvent.startTime}–
              {viewingTeamEvent.finishTime} —{" "}
              <a
                href={viewingTeamEvent.locationUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#5025d1] underline"
              >
                meetup map
              </a>
            </p>
            {viewingTeamEvent.info && (
              <p className="mt-2 text-sm text-[#56585e]">{viewingTeamEvent.info}</p>
            )}
            <h4 className="mt-4 text-sm font-semibold uppercase tracking-wide text-[#56585e]">
              Attending ({viewingTeamEvent.attendees.length})
            </h4>
            <ul className="mt-1 text-sm">
              {viewingTeamEvent.attendees.map((attendee) => (
                <li key={attendee.id} className="py-0.5">
                  {attendee.displayName ?? `Rider #${attendee.id}`}
                </li>
              ))}
            </ul>
            {viewingTeamEvent.absentees.length > 0 && (
              <>
                <h4 className="mt-4 text-sm font-semibold uppercase tracking-wide text-[#56585e]">
                  Not available ({viewingTeamEvent.absentees.length})
                </h4>
                <ul className="mt-1 text-sm text-[#56585e]">
                  {viewingTeamEvent.absentees.map((absentee) => (
                    <li key={absentee.id} className="py-0.5">
                      {absentee.displayName ?? `Rider #${absentee.id}`}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => removeTeamEvent(viewingTeamEvent.id)}
                className="min-h-11 rounded-[50px] border border-red-300 px-6 text-sm font-semibold text-red-700"
              >
                Remove this ride
              </button>
              <button
                type="button"
                onClick={() => setViewingTeamEventId(null)}
                className="min-h-11 rounded-[50px] border border-[#c9c9c9] px-6 text-sm font-semibold text-[#56585e]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Upcoming sessions</h2>
        <ul className="mt-4 divide-y divide-[#e3e3e3]">
          {scheduled.map((occurrence) => (
            <li key={occurrence.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex-1">
                {occurrence.riderResponse === "unsure" && (
                  <span title="This rider is not sure they'll make it">
                    🤔{" "}
                  </span>
                )}
                {occurrence.occurrenceDate} {occurrence.startTime} —{" "}
                {SESSION_TYPE_LABELS[occurrence.sessionType]} —{" "}
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

/** One session type's booking rules: which days are bookable, plus up to two blackout windows. */
function BookingRulesEditor({
  coachId,
  sessionType,
  label,
  initialWindows,
  onSaved,
}: {
  coachId: number;
  sessionType: BookableSessionType;
  label: string;
  initialWindows: BookingWindows | null;
  onSaved: (windows: BookingWindows) => void;
}) {
  const [daysMask, setDaysMask] = useState(
    initialWindows?.allowedDaysMask ?? ALL_DAYS_MASK,
  );
  const [blackouts, setBlackouts] = useState<
    [BlackoutWindow | null, BlackoutWindow | null]
  >([
    initialWindows?.blackouts[0] ?? null,
    initialWindows?.blackouts[1] ?? null,
  ]);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(dayIndex: number) {
    setDaysMask((mask) => mask ^ (1 << dayIndex));
  }

  function updateBlackout(index: 0 | 1, window: BlackoutWindow | null) {
    setBlackouts((current) => {
      const next: [BlackoutWindow | null, BlackoutWindow | null] = [...current];
      next[index] = window;
      return next;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch(`/api/coaches/${coachId}/booking-windows`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionType,
        allowedDaysMask: daysMask,
        blackouts,
      }),
    });
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    onSaved((await response.json()) as BookingWindows);
  }

  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#56585e]">
        {label}
      </h3>
      {error && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <form onSubmit={save} className="mt-3">
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map((day, index) => {
            const allowed = ((daysMask >> index) & 1) === 1;
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(index)}
                aria-pressed={allowed}
                className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${
                  allowed
                    ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                    : "border-[#c9c9c9] text-[#56585e]"
                }`}
              >
                {day.slice(0, 3)}
              </button>
            );
          })}
        </div>
        {blackouts.map((blackout, index) => (
          <div
            key={index}
            className={`${index === 0 ? "mt-4" : "mt-3"} flex flex-wrap items-end gap-3`}
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={blackout !== null}
                onChange={(event) =>
                  updateBlackout(
                    index as 0 | 1,
                    event.target.checked
                      ? DEFAULT_BLACKOUT_WINDOWS[index]
                      : null,
                  )
                }
              />
              Blackout window {index + 1}
            </label>
            {blackout && (
              <>
                <label className="text-sm">
                  Start
                  <input
                    type="time"
                    required
                    value={blackout.start}
                    onChange={(event) =>
                      updateBlackout(index as 0 | 1, {
                        ...blackout,
                        start: event.target.value,
                      })
                    }
                    className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
                  />
                </label>
                <label className="text-sm">
                  End
                  <input
                    type="time"
                    required
                    value={blackout.end}
                    onChange={(event) =>
                      updateBlackout(index as 0 | 1, {
                        ...blackout,
                        end: event.target.value,
                      })
                    }
                    className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
                  />
                </label>
              </>
            )}
          </div>
        ))}
        <button
          type="submit"
          className="mt-4 min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white"
        >
          Save {label.toLowerCase()} booking rules
        </button>
      </form>
    </div>
  );
}
