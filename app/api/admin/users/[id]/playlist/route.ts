import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime, getDb } from "@/lib/db";
import {
  handleAdminGetPlaylist,
  handleAdminPutPlaylist,
} from "@/lib/athlete-playlist";
import { PersonaChangeError } from "@/lib/persona-admin";

export const dynamic = "force-dynamic";

function parseUserId(id: string): number {
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new PersonaChangeError("invalid user id", 400);
  }
  return userId;
}

function errorResponse(error: unknown): Response | null {
  if (error instanceof PersonaChangeError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/admin/users/[id]/playlist">,
) {
  return secureApiResponse(request, async () => {
    try {
      const { id } = await ctx.params;
      return await handleAdminGetPlaylist(await getDb(), request, parseUserId(id));
    } catch (error) {
      const response = errorResponse(error);
      if (response) return response;
      throw error;
    }
  });
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/admin/users/[id]/playlist">,
) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    try {
      const limited = await rateLimitResponse(
        request,
        rateLimiters.write,
        "admin-playlist",
        60,
      );
      if (limited) return limited;
      const { id } = await ctx.params;
      return await handleAdminPutPlaylist(db, request, parseUserId(id));
    } catch (error) {
      const response = errorResponse(error);
      if (response) return response;
      throw error;
    }
  });
}

export { handleApiOptions as OPTIONS };
