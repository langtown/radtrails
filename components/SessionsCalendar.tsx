"use client";

import { useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import { SESSION_TYPE_LABELS } from "@/lib/coaching-constraints";
import type { SessionOccurrence } from "@/lib/session-occurrences";
import type { TeamEvent } from "@/lib/team-events";

function endIso(date: string, startTime: string, durationMinutes: number): string {
  const start = new Date(`${date}T${startTime}:00`);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}` +
    `T${pad(end.getHours())}:${pad(end.getMinutes())}:00`
  );
}

/**
 * Inline month/week calendar of the viewer's Intervals sessions, straight
 * from session_occurrences. Pass perspective="rider" on the profile page
 * (events named after the coach) and "coach" on the coach calendar (events
 * named after each rider).
 */
export default function SessionsCalendar({
  sessions,
  perspective,
  onSelectSession,
  teamEvents = [],
  onSelectTeamEvent,
}: {
  sessions: SessionOccurrence[];
  perspective: "rider" | "coach";
  /** When set (coach views), clicking an event opens it for editing. */
  onSelectSession?: (occurrenceId: number) => void;
  /** Team-wide rides, one event each, shown to coach and team riders. */
  teamEvents?: TeamEvent[];
  /** When set (coach views), clicking a team ride shows its attendees. */
  onSelectTeamEvent?: (teamEventId: number) => void;
}) {
  const events = useMemo(
    () =>
      // Cancelled occurrences are hidden: a removed assignment must leave
      // the calendar, and a reschedule already appears at its new slot.
      sessions
        .filter((session) => session.status === "scheduled")
        .map((session) => {
          const label = SESSION_TYPE_LABELS[session.sessionType];
          // Only the coach sees the unsure flag — a rider's own list already
          // shows their own response, and other riders never see it.
          const unsurePrefix =
            perspective === "coach" && session.riderResponse === "unsure"
              ? "🤔 "
              : "";
          const name =
            perspective === "rider"
              ? `${label} with Coach ${session.coachDisplayName ?? ""}`.trimEnd()
              : `${unsurePrefix}${label} with ${session.riderDisplayName ?? "rider"}`;
          return {
            id: String(session.id),
            title: name,
            start: `${session.occurrenceDate}T${session.startTime}:00`,
            end: endIso(
              session.occurrenceDate,
              session.startTime,
              session.durationMinutes,
            ),
            color: "#1a1a1a",
          };
        }),
    [sessions, perspective],
  );

  const teamCalendarEvents = useMemo(
    () =>
      teamEvents.map((teamEvent) => ({
        id: `team-${teamEvent.id}`,
        title: `${SESSION_TYPE_LABELS.practiceride} (${teamEvent.attendees.length})`,
        start: `${teamEvent.eventDate}T${teamEvent.startTime}:00`,
        end: endIso(
          teamEvent.eventDate,
          teamEvent.startTime,
          teamEvent.durationMinutes,
        ),
        color: "#5025d1",
      })),
    [teamEvents],
  );

  return (
    <section id="sessions-calendar" className="mt-10 border-t border-[#e3e3e3] pt-8">
      <h2 className="mb-4 text-xl font-semibold">Your sessions</h2>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "timeGridDay,timeGridWeek,dayGridMonth",
        }}
        events={[...events, ...teamCalendarEvents]}
        navLinks
        dateClick={(info) =>
          info.view.calendar.changeView("timeGridDay", info.dateStr)
        }
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          const rawId = info.event.id;
          if (rawId.startsWith("team-")) {
            onSelectTeamEvent?.(Number(rawId.slice(5)));
          } else {
            onSelectSession?.(Number(rawId));
          }
        }}
        eventClassNames={
          onSelectSession || onSelectTeamEvent ? ["cursor-pointer"] : []
        }
        height="auto"
        firstDay={1}
        nowIndicator
        eventTimeFormat={{
          hour: "numeric",
          minute: "2-digit",
          meridiem: "short",
        }}
      />
    </section>
  );
}
