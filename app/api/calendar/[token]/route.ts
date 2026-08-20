import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime } from "@/lib/db";
import { handleGetCalendarFeed } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.image,
      "calendar-feed",
      60,
    );
    if (limited) return limited;
    const { token } = await ctx.params;
    return handleGetCalendarFeed(db, token);
  });
}

export { handleApiOptions as OPTIONS };
