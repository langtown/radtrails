import { revalidateTag } from "next/cache";
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime, getDb } from "@/lib/db";
import { PUBLIC_PROFILES_CACHE_TAG } from "@/lib/profile-cache";
import {
  getDefaultWorkerCache,
  invalidatePublicProfileCache,
} from "@/lib/public-profiles";
import { handleGetProfile, handlePutProfile } from "@/lib/profiles";

// Both methods are session-specific and must always run at request time.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () =>
    handleGetProfile(await getDb(), request),
  );
}

export async function PUT(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "profile-write",
      60,
    );
    if (limited) return limited;

    const response = await handlePutProfile(db, request);
    if (response.ok) {
      const body = (await response.clone().json()) as {
        profile?: { slug?: unknown };
      };
      const slug =
        typeof body.profile?.slug === "string" ? body.profile.slug : null;
      await invalidatePublicProfileCache(
        getDefaultWorkerCache(),
        request.url,
        slug,
      );
      revalidateTag(PUBLIC_PROFILES_CACHE_TAG, { expire: 0 });
    }
    return response;
  });
}

export { handleApiOptions as OPTIONS };
