import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import {
  BookingWindowError,
  getCoachBookingWindows,
  isBookableSessionType,
  parseBlackoutInput,
  saveCoachBookingWindows,
} from "@/lib/booking-windows";
import { getAppRuntime, getDb } from "@/lib/db";
import { requireCoachOrAdmin } from "@/lib/weekly-assignments";

export const dynamic = "force-dynamic";

function parseCoachId(id: string): number {
  const coachId = Number(id);
  if (!Number.isInteger(coachId) || coachId <= 0) {
    throw new BookingWindowError("invalid coach id", 400);
  }
  return coachId;
}

function errorResponse(error: unknown): Response | null {
  if (error instanceof AuthenticationError || error instanceof BookingWindowError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}

type SaveBookingWindowsBody = {
  sessionType?: unknown;
  allowedDaysMask?: unknown;
  blackouts?: unknown;
};

function parseSessionType(value: string | null): "intervals" | "lesson" {
  if (!value || !isBookableSessionType(value)) {
    throw new BookingWindowError(
      "sessionType must be intervals or lesson",
      400,
    );
  }
  return value;
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/booking-windows">,
) {
  return secureApiResponse(request, async () => {
    try {
      const db = await getDb();
      const actorId = await requireAuthenticatedUser(db, request);
      const { coachId } = await ctx.params;
      const coach = parseCoachId(coachId);
      const sessionType = parseSessionType(
        new URL(request.url).searchParams.get("sessionType"),
      );
      await requireCoachOrAdmin(db, actorId, coach);
      const windows = await getCoachBookingWindows(db, coach, sessionType);
      return Response.json(
        { windows },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      const response = errorResponse(error);
      if (response) return response;
      throw error;
    }
  });
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/booking-windows">,
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

      let body: SaveBookingWindowsBody;
      try {
        body = (await request.json()) as SaveBookingWindowsBody;
      } catch {
        throw new BookingWindowError("expected a JSON body", 400);
      }
      const sessionType = parseSessionType(
        typeof body.sessionType === "string" ? body.sessionType : null,
      );
      if (typeof body.allowedDaysMask !== "number") {
        throw new BookingWindowError("allowedDaysMask is required", 400);
      }
      if (!Array.isArray(body.blackouts) || body.blackouts.length > 2) {
        throw new BookingWindowError(
          "blackouts must be an array of at most two windows",
          400,
        );
      }

      const windows = await saveCoachBookingWindows(db, {
        actorId,
        coachId: coach,
        sessionType,
        allowedDaysMask: body.allowedDaysMask,
        blackouts: [
          parseBlackoutInput(body.blackouts[0]),
          parseBlackoutInput(body.blackouts[1]),
        ],
      });
      return Response.json(windows);
    } catch (error) {
      const response = errorResponse(error);
      if (response) return response;
      throw error;
    }
  });
}

export { handleApiOptions as OPTIONS };
