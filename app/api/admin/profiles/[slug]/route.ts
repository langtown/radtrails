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
  requireAdminUser,
} from "@/lib/persona-admin";
import { PUBLIC_PROFILES_CACHE_TAG } from "@/lib/profile-cache";
import {
  ProfileError,
  adminGetProfileBySlug,
  adminUpdateProfile,
  validateProfileInput,
} from "@/lib/profiles";
import {
  getDefaultWorkerCache,
  invalidatePublicProfileCache,
} from "@/lib/public-profiles";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown): Response | null {
  if (
    error instanceof PersonaChangeError ||
    error instanceof ProfileError
  ) {
    return Response.json(
      { error: error.message },
      { status: error.status },
    );
  }
  return null;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  return secureApiResponse(request, async () => {
    const { db } = await getAppRuntime();
    const { slug } = await ctx.params;

    try {
      await requireAdminUser(db, request);
    } catch (error) {
      const response = errorResponse(error);
      if (response) return response;
      throw error;
    }

    const profile = await adminGetProfileBySlug(db, slug);
    if (!profile) {
      return Response.json({ error: "profile not found" }, { status: 404 });
    }
    return Response.json(
      { profile },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const { slug } = await ctx.params;

    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "admin-profiles",
      60,
    );
    if (limited) return limited;

    try {
      const actorId = await requireAdminUser(db, request);

      const existing = await adminGetProfileBySlug(db, slug);
      if (!existing) {
        return Response.json(
          { error: "profile not found" },
          { status: 404 },
        );
      }

      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        throw new ProfileError("request body must be valid JSON", 400);
      }
      const input = validateProfileInput(raw);

      // An admin edit is also an approval: it publishes straight to
      // published_profiles, so the public caches must be purged too.
      await adminUpdateProfile(db, actorId, existing.userId, input);
      await invalidatePublicProfileCache(
        getDefaultWorkerCache(),
        [request.url, site.domain],
        slug,
      );
      revalidateTag(PUBLIC_PROFILES_CACHE_TAG, { expire: 0 });

      return Response.json({ ok: true, status: "approved" });
    } catch (error) {
      const response = errorResponse(error);
      if (response) return response;
      throw error;
    }
  });
}

export { handleApiOptions as OPTIONS };
