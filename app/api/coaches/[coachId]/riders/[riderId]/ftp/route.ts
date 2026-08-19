import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { FtpZoneError, getFtpZones, setFtpZones } from "@/lib/athlete-ftp";
import { SESSION_TYPES } from "@/lib/coaching-constraints";
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
    throw new FtpZoneError("invalid id", 400);
  }
  return { coach, rider };
}

function sessionTypeParam(request: Request): string {
  return new URL(request.url).searchParams.get("sessionType") ?? SESSION_TYPES[0];
}

function errorResponse(error: unknown): Response | null {
  if (
    error instanceof AuthenticationError ||
    error instanceof FtpZoneError ||
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

    const zones = await getFtpZones(
      db,
      actorId,
      coach,
      rider,
      sessionTypeParam(request),
    );
    return Response.json(zones, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

type PutFtpBody = {
  sessionType?: unknown;
  z1Watts?: unknown;
  z2Watts?: unknown;
  z3Watts?: unknown;
  z4Watts?: unknown;
  z5Watts?: unknown;
};

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
      throw new FtpZoneError("expected a JSON body", 400);
    }

    for (const key of [
      "z1Watts",
      "z2Watts",
      "z3Watts",
      "z4Watts",
      "z5Watts",
    ] as const) {
      if (typeof body[key] !== "number") {
        throw new FtpZoneError(`${key} is required`, 400);
      }
    }

    const zones = await setFtpZones(db, {
      actorId,
      coachId: coach,
      riderId: rider,
      sessionType:
        typeof body.sessionType === "string" ? body.sessionType : SESSION_TYPES[0],
      z1Watts: body.z1Watts as number,
      z2Watts: body.z2Watts as number,
      z3Watts: body.z3Watts as number,
      z4Watts: body.z4Watts as number,
      z5Watts: body.z5Watts as number,
    });

    return Response.json(zones);
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
