import { handleGetMe } from "@/lib/auth";
import { handleApiOptions, secureApiResponse } from "@/lib/api-security";
import { getDb } from "@/lib/db";

// This response is session-specific and must always run at request time.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () =>
    handleGetMe(await getDb(), request),
  );
}

export { handleApiOptions as OPTIONS };
