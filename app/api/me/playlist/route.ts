import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { handleGetPlaylist, handlePutPlaylist } from "@/lib/athlete-playlist";
import { getAppRuntime, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () =>
    handleGetPlaylist(await getDb(), request),
  );
}

export async function PUT(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "playlist-write",
      60,
    );
    return limited ?? handlePutPlaylist(db, request);
  });
}

export { handleApiOptions as OPTIONS };
