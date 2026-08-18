import { revalidateTag } from "next/cache";
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime } from "@/lib/db";
import { site } from "@/lib/content/site";
import {
  PersonaChangeError,
  applyPersonaChange,
  requireAdminUser,
} from "@/lib/persona-admin";
import type { PersonaKey } from "@/lib/personas";
import { PUBLIC_PROFILES_CACHE_TAG } from "@/lib/profile-cache";
import {
  findProfileSlug,
  getDefaultWorkerCache,
  invalidatePublicProfileCache,
} from "@/lib/public-profiles";

type PersonaRequestBody = {
  persona?: unknown;
  action?: unknown;
};

/**
 * Grants or revokes one persona on one account.
 *
 * Note this is persona management only. Moving someone into theteam does not
 * publish an unapproved profile edit — content review is a separate gate.
 */
async function changePersona(
  request: Request,
  ctx: RouteContext<"/api/admin/users/[id]/personas">,
) {
  const { db, rateLimiters } = await getAppRuntime();

  try {
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "admin-personas",
      60,
    );
    if (limited) return limited;

    const actorId = await requireAdminUser(db, request);

    const { id } = await ctx.params;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new PersonaChangeError("invalid user id", 400);
    }

    let body: PersonaRequestBody;
    try {
      body = (await request.json()) as PersonaRequestBody;
    } catch {
      throw new PersonaChangeError("expected a JSON body", 400);
    }

    if (body.action !== "grant" && body.action !== "revoke") {
      throw new PersonaChangeError("action must be grant or revoke", 400);
    }

    if (typeof body.persona !== "string") {
      throw new PersonaChangeError("persona is required", 400);
    }

    // applyPersonaChange validates the persona against the known set, so an
    // unrecognised value is rejected there rather than trusted here.
    await applyPersonaChange(db, {
      actorId,
      userId,
      persona: body.persona as PersonaKey,
      action: body.action,
      onPublicVisibilityChanged: async (changedUserId) => {
        await invalidatePublicProfileCache(
          getDefaultWorkerCache(),
          [request.url, site.domain],
          await findProfileSlug(db, changedUserId),
        );
        revalidateTag(PUBLIC_PROFILES_CACHE_TAG, { expire: 0 });
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof PersonaChangeError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export function POST(
  request: Request,
  ctx: RouteContext<"/api/admin/users/[id]/personas">,
) {
  return secureApiResponse(request, () => changePersona(request, ctx));
}

export { handleApiOptions as OPTIONS };
