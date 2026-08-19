"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import CoachScheduleManager from "@/app/coach/CoachScheduleManager";
import type { SessionOccurrence } from "@/lib/session-occurrences";
import type { WeeklyAssignment } from "@/lib/weekly-assignments";

type Rider = { id: number; displayName: string | null };

type ScheduleResponse = {
  assignments: WeeklyAssignment[];
  occurrences: SessionOccurrence[];
  eligibleRiders: Rider[];
};

export default function AdminCoachSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const response = await fetch(`/api/coaches/${id}/schedule`);
      if (cancelled) return;

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setLoadError(body.error ?? "You do not have access to this page.");
        return;
      }

      setData((await response.json()) as ScheduleResponse);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <h1 className="text-3xl font-semibold">Not available</h1>
        <p className="mt-4 text-[#56585e]">{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <p className="text-[#56585e]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
      <h1 className="text-3xl font-semibold md:text-4xl">Coach calendar</h1>
      <CoachScheduleManager
        coachId={Number(id)}
        initialAssignments={data.assignments}
        initialOccurrences={data.occurrences}
        eligibleRiders={data.eligibleRiders}
      />
    </div>
  );
}
