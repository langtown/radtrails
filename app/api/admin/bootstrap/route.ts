import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { handleBootstrapAdmin } from "@/lib/admin-bootstrap";
import { getAppRuntime } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters, adminBootstrapToken } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.login,
      "admin-bootstrap",
      60,
    );
    if (limited) return limited;

    return handleBootstrapAdmin(db, request, adminBootstrapToken);
  });
}

export { handleApiOptions as OPTIONS };
