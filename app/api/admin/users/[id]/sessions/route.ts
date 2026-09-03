import {
  handleApiOptions,
  secureApiResponse,
} from "@/lib/api-security";
import { getDb } from "@/lib/db";
import { handleGetUserSessions } from "@/lib/session-occurrences";
import { PersonaChangeError } from "@/lib/persona-admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/admin/users/[id]/sessions">,
) {
  return secureApiResponse(request, async () => {
    const { id } = await ctx.params;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return Response.json({ error: "invalid user id" }, { status: 400 });
    }
    try {
      return await handleGetUserSessions(await getDb(), request, userId);
    } catch (error) {
      if (error instanceof PersonaChangeError) {
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
  });
}

export { handleApiOptions as OPTIONS };
