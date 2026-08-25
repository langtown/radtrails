import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { getAppRuntime } from "@/lib/db";
import { setTeamEventAbsence, TeamEventError } from "@/lib/team-events";

export const dynamic = "force-dynamic";

type AvailabilityBody = { unavailable?: unknown };

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/me/team-events/[eventId]/availability">,
) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    try {
      const limited = await rateLimitResponse(
        request,
        rateLimiters.write,
        "me-team-events",
        60,
      );
      if (limited) return limited;

      const userId = await requireAuthenticatedUser(db, request);
      const { eventId } = await ctx.params;
      const event = Number(eventId);
      if (!Number.isInteger(event) || event <= 0) {
        throw new TeamEventError("invalid event id", 400);
      }

      let body: AvailabilityBody;
      try {
        body = (await request.json()) as AvailabilityBody;
      } catch {
        throw new TeamEventError("expected a JSON body", 400);
      }
      if (typeof body.unavailable !== "boolean") {
        throw new TeamEventError("unavailable must be true or false", 400);
      }

      await setTeamEventAbsence(db, userId, event, body.unavailable);
      return Response.json({ ok: true });
    } catch (error) {
      if (
        error instanceof AuthenticationError ||
        error instanceof TeamEventError
      ) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  });
}

export { handleApiOptions as OPTIONS };
