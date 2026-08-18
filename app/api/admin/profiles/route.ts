import { handleApiOptions, secureApiResponse } from "@/lib/api-security";
import { getDb } from "@/lib/db";
import { handleListPendingProfiles } from "@/lib/profile-review";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () =>
    handleListPendingProfiles(await getDb(), request),
  );
}

export { handleApiOptions as OPTIONS };
