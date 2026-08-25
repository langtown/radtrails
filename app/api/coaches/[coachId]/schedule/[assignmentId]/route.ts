import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { getAppRuntime } from "@/lib/db";
import {
  deactivateWeeklyAssignment,
  ScheduleAssignmentError,
} from "@/lib/weekly-assignments";

export const dynamic = "force-dynamic";

async function deleteAssignment(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule/[assignmentId]">,
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
    const { coachId, assignmentId } = await ctx.params;
    const coach = Number(coachId);
    const assignment = Number(assignmentId);
    if (
      !Number.isInteger(coach) ||
      coach <= 0 ||
      !Number.isInteger(assignment) ||
      assignment <= 0
    ) {
      throw new ScheduleAssignmentError("invalid id", 400);
    }

    await deactivateWeeklyAssignment(db, actorId, coach, assignment);
    return Response.json({ ok: true });
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof ScheduleAssignmentError
    ) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export function DELETE(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule/[assignmentId]">,
) {
  return secureApiResponse(request, () => deleteAssignment(request, ctx));
}

export { handleApiOptions as OPTIONS };
