import { revalidateTag } from "next/cache";
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime } from "@/lib/db";
import { site } from "@/lib/content/site";
import { PUBLIC_PROFILES_CACHE_TAG } from "@/lib/profile-cache";
import { handleReviewProfile } from "@/lib/profile-review";
import {
  findProfileSlug,
  getDefaultWorkerCache,
  invalidatePublicProfileCache,
} from "@/lib/public-profiles";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return secureApiResponse(request, async () => {
    const { id } = await ctx.params;
    const profileUserId = Number(id);
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "admin-review",
      60,
    );
    if (limited) return limited;

    return handleReviewProfile(db, request, profileUserId, async () => {
      await invalidatePublicProfileCache(
        getDefaultWorkerCache(),
        [request.url, site.domain],
        await findProfileSlug(db, profileUserId),
      );
      revalidateTag(PUBLIC_PROFILES_CACHE_TAG, { expire: 0 });
    });
  });
}

export { handleApiOptions as OPTIONS };
