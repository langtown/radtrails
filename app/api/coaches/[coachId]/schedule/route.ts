import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { BookingWindowError, getAllCoachBookingWindows } from "@/lib/booking-windows";
import { getAppRuntime, getDb } from "@/lib/db";
import {
  listOccurrencesForCoach,
  ScheduleOccurrenceError,
} from "@/lib/session-occurrences";
import { listTeamEvents } from "@/lib/team-events";
import {
  createWeeklyAssignment,
  getCoachDisplayName,
  listSchedulableRiders,
  listWeeklyAssignmentsForCoach,
  ScheduleAssignmentError,
} from "@/lib/weekly-assignments";

export const dynamic = "force-dynamic";

function parseCoachId(id: string): number {
  const coachId = Number(id);
  if (!Number.isInteger(coachId) || coachId <= 0) {
    throw new ScheduleAssignmentError("invalid coach id", 400);
  }
  return coachId;
}

function errorResponse(error: unknown): Response | null {
  if (
    error instanceof AuthenticationError ||
    error instanceof ScheduleAssignmentError ||
    error instanceof ScheduleOccurrenceError ||
    error instanceof BookingWindowError
  ) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}

async function getSchedule(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule">,
) {
  try {
    const db = await getDb();
    const actorId = await requireAuthenticatedUser(db, request);
    const { coachId } = await ctx.params;
    const id = parseCoachId(coachId);

    const assignments = await listWeeklyAssignmentsForCoach(db, actorId, id);
    // listOccurrencesForCoach already calls ensureOccurrencesGenerated.
    const occurrences = await listOccurrencesForCoach(db, actorId, id);
    const eligibleRiders = await listSchedulableRiders(db);
    const coachDisplayName = await getCoachDisplayName(db, actorId, id);
    const teamEvents = await listTeamEvents(db);
    const bookingWindows = await getAllCoachBookingWindows(db, id);

    return Response.json(
      {
        assignments,
        occurrences,
        eligibleRiders,
        coachDisplayName,
        teamEvents,
        bookingWindows,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

type CreateAssignmentBody = {
  riderId?: unknown;
  sessionType?: unknown;
  dayOfWeek?: unknown;
  startTime?: unknown;
  durationMinutes?: unknown;
  occurrenceDate?: unknown;
};

async function postSchedule(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule">,
) {
  const { db, rateLimiters } = await getAppRuntime();
  try {
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "coach-schedule-write",
      60,
    );
    if (limited) return limited;

    const actorId = await requireAuthenticatedUser(db, request);
    const { coachId } = await ctx.params;
    const id = parseCoachId(coachId);

    let body: CreateAssignmentBody;
    try {
      body = (await request.json()) as CreateAssignmentBody;
    } catch {
      throw new ScheduleAssignmentError("expected a JSON body", 400);
    }

    if (typeof body.riderId !== "number") {
      throw new ScheduleAssignmentError("riderId is required", 400);
    }
    if (typeof body.sessionType !== "string") {
      throw new ScheduleAssignmentError("sessionType is required", 400);
    }
    // Lessons derive their weekday from occurrenceDate; intervals need dayOfWeek.
    if (body.sessionType !== "lesson" && typeof body.dayOfWeek !== "number") {
      throw new ScheduleAssignmentError("dayOfWeek is required", 400);
    }
    if (
      body.occurrenceDate !== undefined &&
      typeof body.occurrenceDate !== "string"
    ) {
      throw new ScheduleAssignmentError("occurrenceDate must be a string", 400);
    }
    if (typeof body.startTime !== "string") {
      throw new ScheduleAssignmentError("startTime is required", 400);
    }
    const durationMinutes =
      typeof body.durationMinutes === "number" ? body.durationMinutes : 60;

    const assignment = await createWeeklyAssignment(db, {
      actorId,
      coachId: id,
      riderId: body.riderId,
      sessionType: body.sessionType,
      dayOfWeek: typeof body.dayOfWeek === "number" ? body.dayOfWeek : 0,
      startTime: body.startTime,
      durationMinutes,
      occurrenceDate:
        typeof body.occurrenceDate === "string" ? body.occurrenceDate : undefined,
    });

    return Response.json(assignment, { status: 201 });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

export function GET(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule">,
) {
  return secureApiResponse(request, () => getSchedule(request, ctx));
}

export function POST(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule">,
) {
  return secureApiResponse(request, () => postSchedule(request, ctx));
}

export { handleApiOptions as OPTIONS };
