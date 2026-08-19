import type { SessionOccurrence } from "@/lib/session-occurrences";

export default function MySessions({
  sessions,
}: {
  sessions: SessionOccurrence[];
}) {
  const upcoming = sessions.filter((session) => session.status === "scheduled");

  if (upcoming.length === 0) return null;

  return (
    <section className="mt-10 border-t border-[#e3e3e3] pt-8">
      <h2 className="text-xl font-semibold">Your upcoming sessions</h2>
      <ul className="mt-4 divide-y divide-[#e3e3e3]">
        {upcoming.map((session) => (
          <li key={session.id} className="py-3">
            {session.occurrenceDate} at {session.startTime}
          </li>
        ))}
      </ul>
    </section>
  );
}
