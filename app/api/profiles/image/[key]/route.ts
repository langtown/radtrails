import { getDb } from "@/lib/db";
import { handleApiOptions, secureApiResponse } from "@/lib/api-security";
import { getProfileImageResponse } from "@/lib/profile-images";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ key: string }> },
) {
  return secureApiResponse(request, async () => {
    const { key } = await ctx.params;
    return getProfileImageResponse(await getDb(), key);
  });
}

export { handleApiOptions as OPTIONS };
