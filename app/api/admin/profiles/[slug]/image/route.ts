import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime } from "@/lib/db";
import { handleAdminProfileImageUpload } from "@/lib/profile-images";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.image,
      "admin-profile-image",
      60,
    );
    if (limited) return limited;

    const { slug } = await ctx.params;
    return handleAdminProfileImageUpload(db, request, slug);
  });
}

export { handleApiOptions as OPTIONS };
