import {
  handleApiOptions,
  secureApiResponse,
} from "@/lib/api-security";
import { getDb } from "@/lib/db";
import { handleGetMySessions } from "@/lib/session-occurrences";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () =>
    handleGetMySessions(await getDb(), request),
  );
}

export { handleApiOptions as OPTIONS };
