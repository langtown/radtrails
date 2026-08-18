import { handleApiOptions, secureApiResponse } from "@/lib/api-security";
import { getDb } from "@/lib/db";
import {
  PersonaChangeError,
  listUsersWithPersonas,
  requireAdminUser,
} from "@/lib/persona-admin";

/**
 * Thin adapter over lib/persona-admin. All authorization and business rules
 * live there so they can be tested against a real database; this layer only
 * translates between HTTP and those functions.
 */
export async function GET(request: Request) {
  return secureApiResponse(request, async () => {
    const db = await getDb();

    try {
      await requireAdminUser(db, request);
    } catch (error) {
      if (error instanceof PersonaChangeError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    return Response.json({ users: await listUsersWithPersonas(db) });
  });
}

export { handleApiOptions as OPTIONS };
