import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime } from "@/lib/db";
import { handleProfileImageUpload } from "@/lib/profile-images";

export async function POST(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.image,
      "profile-image",
      60,
    );
    return limited ?? handleProfileImageUpload(db, request);
  });
}

export { handleApiOptions as OPTIONS };
