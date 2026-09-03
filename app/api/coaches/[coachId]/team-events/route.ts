import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { BookingWindowError } from "@/lib/booking-windows";
import { getAppRuntime, getDb } from "@/lib/db";
import {
  createTeamEvent,
  listTeamEvents,
  TeamEventError,
} from "@/lib/team-events";
import {
  requireCoachOrAdmin,
  ScheduleAssignmentError,
} from "@/lib/weekly-assignments";

export const dynamic = "force-dynamic";

function parseCoachId(id: string): number {
  const coachId = Number(id);
  if (!Number.isInteger(coachId) || coachId <= 0) {
    throw new TeamEventError("invalid coach id", 400);
  }
  return coachId;
}

function errorResponse(error: unknown): Response | null {
  if (
    error instanceof AuthenticationError ||
    error instanceof TeamEventError ||
    error instanceof ScheduleAssignmentError ||
    error instanceof BookingWindowError
  ) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}

type CreateTeamEventBody = {
  eventDate?: unknown;
  startTime?: unknown;
  finishTime?: unknown;
  locationUrl?: unknown;
  info?: unknown;
};

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/team-events">,
) {
  return secureApiResponse(request, async () => {
    try {
      const db = await getDb();
      const actorId = await requireAuthenticatedUser(db, request);
      const { coachId } = await ctx.params;
      const coach = parseCoachId(coachId);
      // Authorization: same rule as the coach calendar itself.
      await requireCoachOrAdmin(db, actorId, coach);
      return Response.json(
        { teamEvents: await listTeamEvents(db) },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      const response = errorResponse(error);
      if (response) return response;
      throw error;
    }
  });
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/team-events">,
) {
  return secureApiResponse(request, async () => {
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
      const coach = parseCoachId(coachId);

      let body: CreateTeamEventBody;
      try {
        body = (await request.json()) as CreateTeamEventBody;
      } catch {
        throw new TeamEventError("expected a JSON body", 400);
      }
      if (
        typeof body.eventDate !== "string" ||
        typeof body.startTime !== "string" ||
        typeof body.finishTime !== "string"
      ) {
        throw new TeamEventError(
          "eventDate, startTime, and finishTime are required",
          400,
        );
      }

      const teamEvent = await createTeamEvent(db, {
        actorId,
        coachId: coach,
        eventDate: body.eventDate,
        startTime: body.startTime,
        finishTime: body.finishTime,
        locationUrl: body.locationUrl,
        info: body.info,
      });
      return Response.json(teamEvent, { status: 201 });
    } catch (error) {
      const response = errorResponse(error);
      if (response) return response;
      throw error;
    }
  });
}

export { handleApiOptions as OPTIONS };
