import { handleLogout } from "@/lib/auth";
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime } from "@/lib/db";

/**
 * Ends the session.
 *
 * POST only: a GET logout can be triggered by any image tag or prefetch on a
 * page, signing people out without them asking.
 */
export async function POST(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "logout",
      60,
    );
    return limited ?? handleLogout(db, request);
  });
}

export { handleApiOptions as OPTIONS };
