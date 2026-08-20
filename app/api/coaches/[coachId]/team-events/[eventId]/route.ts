import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { getAppRuntime } from "@/lib/db";
import { deleteTeamEvent, TeamEventError } from "@/lib/team-events";
import { ScheduleAssignmentError } from "@/lib/weekly-assignments";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/team-events/[eventId]">,
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
      const { coachId, eventId } = await ctx.params;
      const coach = Number(coachId);
      const event = Number(eventId);
      if (
        !Number.isInteger(coach) ||
        coach <= 0 ||
        !Number.isInteger(event) ||
        event <= 0
      ) {
        throw new TeamEventError("invalid id", 400);
      }

      await deleteTeamEvent(db, actorId, coach, event);
      return Response.json({ ok: true });
    } catch (error) {
      if (
        error instanceof AuthenticationError ||
        error instanceof TeamEventError ||
        error instanceof ScheduleAssignmentError
      ) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  });
}

export { handleApiOptions as OPTIONS };
