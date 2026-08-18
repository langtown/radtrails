import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime, getDb } from "@/lib/db";
import { handleGetData, handlePutData } from "@/lib/user-data";

// Both methods are session-specific and must always run at request time.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () =>
    handleGetData(await getDb(), request),
  );
}

export async function PUT(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "data-write",
      60,
    );
    return limited ?? handlePutData(db, request);
  });
}

export { handleApiOptions as OPTIONS };
