import {
  handleApiOptions,
  secureApiResponse,
} from "@/lib/api-security";
import { getDb } from "@/lib/db";
import { handleGetNextRide } from "@/lib/team-events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () =>
    handleGetNextRide(await getDb(), request),
  );
}

export { handleApiOptions as OPTIONS };
