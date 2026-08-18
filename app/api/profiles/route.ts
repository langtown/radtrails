import { getAppRuntime } from "@/lib/db";
import { handleApiOptions, secureApiResponse } from "@/lib/api-security";
import {
  getDefaultWorkerCache,
  handleListPublicProfiles,
} from "@/lib/public-profiles";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, waitUntil } = await getAppRuntime();
    return handleListPublicProfiles(
      db,
      request,
      getDefaultWorkerCache(),
      waitUntil,
    );
  });
}

export { handleApiOptions as OPTIONS };
