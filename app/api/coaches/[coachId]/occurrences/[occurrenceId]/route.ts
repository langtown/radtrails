import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { getAppRuntime } from "@/lib/db";
import {
  cancelOccurrence,
  rescheduleOccurrence,
  ScheduleOccurrenceError,
} from "@/lib/session-occurrences";

export const dynamic = "force-dynamic";

type PatchBody = {
  action?: unknown;
  occurrenceDate?: unknown;
  startTime?: unknown;
};

async function patchOccurrence(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/occurrences/[occurrenceId]">,
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
    const { coachId, occurrenceId } = await ctx.params;
    const coach = Number(coachId);
    const occurrence = Number(occurrenceId);
    if (
      !Number.isInteger(coach) ||
      coach <= 0 ||
      !Number.isInteger(occurrence) ||
      occurrence <= 0
    ) {
      throw new ScheduleOccurrenceError("invalid id", 400);
    }

    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      throw new ScheduleOccurrenceError("expected a JSON body", 400);
    }

    if (body.action === "cancel") {
      await cancelOccurrence(db, actorId, coach, occurrence);
      return Response.json({ ok: true });
    }

    if (body.action === "reschedule") {
      if (
        typeof body.occurrenceDate !== "string" ||
        typeof body.startTime !== "string"
      ) {
        throw new ScheduleOccurrenceError(
          "occurrenceDate and startTime are required to reschedule",
          400,
        );
      }
      const updated = await rescheduleOccurrence(db, {
        actorId,
        coachId: coach,
        occurrenceId: occurrence,
        occurrenceDate: body.occurrenceDate,
        startTime: body.startTime,
      });
      return Response.json(updated);
    }

    throw new ScheduleOccurrenceError(
      "action must be cancel or reschedule",
      400,
    );
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof ScheduleOccurrenceError
    ) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export function PATCH(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/occurrences/[occurrenceId]">,
) {
  return secureApiResponse(request, () => patchOccurrence(request, ctx));
}

export { handleApiOptions as OPTIONS };
