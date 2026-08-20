import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime } from "@/lib/db";
import {
  handleGetMyCalendar,
  handleRotateMyCalendar,
} from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "me-calendar",
      60,
    );
    return limited ?? handleGetMyCalendar(db, request);
  });
}

export async function POST(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "me-calendar",
      60,
    );
    return limited ?? handleRotateMyCalendar(db, request);
  });
}

export { handleApiOptions as OPTIONS };
