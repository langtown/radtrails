import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime, getDb } from "@/lib/db";
import { handleGetConsent, handlePostConsent } from "@/lib/consent";

// Session-specific; must run at request time.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () =>
    handleGetConsent(await getDb(), request),
  );
}

export async function POST(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "minor-consent",
      20,
    );
    if (limited) return limited;
    return handlePostConsent(db, request);
  });
}

export { handleApiOptions as OPTIONS };
