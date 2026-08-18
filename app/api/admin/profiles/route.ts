import { handleApiOptions, secureApiResponse } from "@/lib/api-security";
import { getDb } from "@/lib/db";
import {
  PersonaChangeError,
  requireAdminUser,
} from "@/lib/persona-admin";
import { PERSONA_KEYS, type PersonaKey } from "@/lib/personas";
import { handleListPendingProfiles } from "@/lib/profile-review";
import { adminListProfilesByPersona } from "@/lib/profiles";

export const dynamic = "force-dynamic";

function isKnownPersona(value: string): value is PersonaKey {
  return (PERSONA_KEYS as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const persona = new URL(request.url).searchParams.get("persona");

  // Without a filter this keeps its original behaviour: the pending review
  // queue. With ?persona= it lists every account holding that persona,
  // whatever state its profile is in, for the admin management screen.
  if (persona === null) {
    return secureApiResponse(request, async () =>
      handleListPendingProfiles(await getDb(), request),
    );
  }

  return secureApiResponse(request, async () => {
    const db = await getDb();

    try {
      await requireAdminUser(db, request);
    } catch (error) {
      if (error instanceof PersonaChangeError) {
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    if (!isKnownPersona(persona)) {
      return Response.json({ error: "unknown persona" }, { status: 400 });
    }

    return Response.json(
      { profiles: await adminListProfilesByPersona(db, persona) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

export { handleApiOptions as OPTIONS };
