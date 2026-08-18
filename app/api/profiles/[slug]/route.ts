import { getAppRuntime } from "@/lib/db";
import { handleApiOptions, secureApiResponse } from "@/lib/api-security";
import {
  getDefaultWorkerCache,
  handleGetPublicProfile,
} from "@/lib/public-profiles";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  return secureApiResponse(request, async () => {
    const { slug } = await ctx.params;
    const { db, waitUntil } = await getAppRuntime();
    return handleGetPublicProfile(
      db,
      request,
      slug,
      getDefaultWorkerCache(),
      waitUntil,
    );
  });
}

export { handleApiOptions as OPTIONS };
