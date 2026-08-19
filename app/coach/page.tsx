import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import {
  ensureOccurrencesGenerated,
  listOccurrencesForCoach,
} from "@/lib/session-occurrences";
import {
  listSchedulableRiders,
  listWeeklyAssignmentsForCoach,
} from "@/lib/weekly-assignments";
import CoachScheduleManager from "./CoachScheduleManager";

export const metadata: Metadata = {
  title: "Your calendar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const user = await getCurrentUser();

  if (!user || !user.personas.includes("coach")) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <h1 className="text-3xl font-semibold">Not available</h1>
        <p className="mt-4 text-[#56585e]">
          You do not have access to this page.
        </p>
      </div>
    );
  }

  const db = await getDb();
  const [assignments, eligibleRiders] = await Promise.all([
    listWeeklyAssignmentsForCoach(db, user.id, user.id),
    listSchedulableRiders(db),
  ]);
  await ensureOccurrencesGenerated(db);
  const occurrences = await listOccurrencesForCoach(db, user.id, user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
      <h1 className="text-3xl font-semibold md:text-4xl">Your calendar</h1>
      <p className="mt-4 max-w-2xl text-[#56585e]">
        Manage weekly Intervals assignments, upcoming sessions, and each
        rider&apos;s FTP zones.
      </p>
      <CoachScheduleManager
        coachId={user.id}
        initialAssignments={assignments}
        initialOccurrences={occurrences}
        eligibleRiders={eligibleRiders}
      />
    </div>
  );
}
