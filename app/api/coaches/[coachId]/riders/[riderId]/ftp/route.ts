import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { FtpError, getPowerForCoach, setPower } from "@/lib/athlete-ftp";
import { getAppRuntime, getDb } from "@/lib/db";
import { ScheduleAssignmentError } from "@/lib/weekly-assignments";

export const dynamic = "force-dynamic";

function parseIds(
  coachId: string,
  riderId: string,
): { coach: number; rider: number } {
  const coach = Number(coachId);
  const rider = Number(riderId);
  if (
    !Number.isInteger(coach) ||
    coach <= 0 ||
    !Number.isInteger(rider) ||
    rider <= 0
  ) {
    throw new FtpError("invalid id", 400);
  }
  return { coach, rider };
}

function errorResponse(error: unknown): Response | null {
  if (
    error instanceof AuthenticationError ||
    error instanceof FtpError ||
    error instanceof ScheduleAssignmentError
  ) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}

async function getFtp(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/riders/[riderId]/ftp">,
) {
  try {
    const db = await getDb();
    const actorId = await requireAuthenticatedUser(db, request);
    const { coachId, riderId } = await ctx.params;
    const { coach, rider } = parseIds(coachId, riderId);

    return Response.json(await getPowerForCoach(db, actorId, coach, rider), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

type PutFtpBody = { zone5Watts?: unknown };

async function putFtp(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/riders/[riderId]/ftp">,
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
    const { coachId, riderId } = await ctx.params;
    const { coach, rider } = parseIds(coachId, riderId);

    let body: PutFtpBody;
    try {
      body = (await request.json()) as PutFtpBody;
    } catch {
      throw new FtpError("expected a JSON body", 400);
    }
    if (typeof body.zone5Watts !== "number") {
      throw new FtpError("zone5Watts is required", 400);
    }

    const ftp = await setPower(db, {
      actorId,
      coachId: coach,
      riderId: rider,
      zone5Watts: body.zone5Watts,
    });

    return Response.json(ftp);
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

export function GET(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/riders/[riderId]/ftp">,
) {
  return secureApiResponse(request, () => getFtp(request, ctx));
}

export function PUT(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/riders/[riderId]/ftp">,
) {
  return secureApiResponse(request, () => putFtp(request, ctx));
}

export { handleApiOptions as OPTIONS };
