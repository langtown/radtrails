import { requireAuthenticatedUser, AuthenticationError } from "@/lib/auth";
import {
  CONSENT_VERSION,
  GUARDIAN_RELATIONSHIPS,
  type GuardianRelationship,
} from "@/lib/content/consent";

const PRIVATE_NO_STORE = "private, no-store";
const MAX_LEN = 120;

export type MinorConsentRecord = {
  minorName: string;
  guardianName: string;
  guardianRelationship: string;
  signature: string;
  consentVersion: string;
  agreedAt: string;
};

/** Thrown for invalid consent submissions; carries the HTTP status to return. */
export class ConsentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ConsentError";
    this.status = status;
  }
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

function requiredField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConsentError(`${label} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_LEN) {
    throw new ConsentError(`${label} must be ${MAX_LEN} characters or fewer.`);
  }
  return trimmed;
}

/** Reads the guardian consent on file for a user, if any. */
export async function getMinorConsent(
  db: D1Database,
  userId: number,
): Promise<MinorConsentRecord | null> {
  const row = await db
    .prepare(
      `SELECT minor_name, guardian_name, guardian_relationship, signature,
              consent_version, agreed_at
         FROM minor_consents WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{
      minor_name: string;
      guardian_name: string;
      guardian_relationship: string;
      signature: string;
      consent_version: string;
      agreed_at: string;
    }>();

  if (!row) return null;
  return {
    minorName: row.minor_name,
    guardianName: row.guardian_name,
    guardianRelationship: row.guardian_relationship,
    signature: row.signature,
    consentVersion: row.consent_version,
    agreedAt: row.agreed_at,
  };
}

/**
 * Validates and stores (or replaces) a guardian's e-signed consent. The typed
 * signature must match the guardian's typed name, and `agree` must be true.
 */
export async function recordMinorConsent(
  db: D1Database,
  userId: number,
  input: unknown,
): Promise<MinorConsentRecord> {
  if (!input || typeof input !== "object") {
    throw new ConsentError("Invalid request.");
  }
  const body = input as Record<string, unknown>;

  if (body.agree !== true) {
    throw new ConsentError("You must agree to the consent statement.");
  }

  const minorName = requiredField(body.minorName, "Rider name");
  const guardianName = requiredField(body.guardianName, "Parent or guardian name");
  const relationship = requiredField(body.guardianRelationship, "Relationship");
  const signature = requiredField(body.signature, "Signature");

  if (!(GUARDIAN_RELATIONSHIPS as readonly string[]).includes(relationship)) {
    throw new ConsentError("Select a valid relationship.");
  }
  if (signature.toLocaleLowerCase("en-US") !== guardianName.toLocaleLowerCase("en-US")) {
    throw new ConsentError("Your typed signature must match the parent or guardian name.");
  }

  await db
    .prepare(
      `INSERT OR REPLACE INTO minor_consents
         (user_id, minor_name, guardian_name, guardian_relationship, signature,
          consent_version, agreed_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(userId, minorName, guardianName, relationship, signature, CONSENT_VERSION)
    .run();

  const saved = await getMinorConsent(db, userId);
  if (!saved) throw new ConsentError("Could not save consent.", 500);
  return saved;
}

export type MinorConsentAdminRow = MinorConsentRecord & {
  userId: number;
  email: string | null;
};

/** Lists every stored consent with the account's email, newest first (admin). */
export async function listMinorConsents(
  db: D1Database,
): Promise<MinorConsentAdminRow[]> {
  const { results } = await db
    .prepare(
      `SELECT mc.user_id, u.email, mc.minor_name, mc.guardian_name,
              mc.guardian_relationship, mc.signature, mc.consent_version, mc.agreed_at
         FROM minor_consents mc
         JOIN users u ON u.id = mc.user_id
         ORDER BY mc.agreed_at DESC`,
    )
    .all<{
      user_id: number;
      email: string | null;
      minor_name: string;
      guardian_name: string;
      guardian_relationship: string;
      signature: string;
      consent_version: string;
      agreed_at: string;
    }>();

  return results.map((row) => ({
    userId: row.user_id,
    email: row.email,
    minorName: row.minor_name,
    guardianName: row.guardian_name,
    guardianRelationship: row.guardian_relationship,
    signature: row.signature,
    consentVersion: row.consent_version,
    agreedAt: row.agreed_at,
  }));
}

/** HTTP behavior for GET /api/me/consent. */
export async function handleGetConsent(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    const consent = await getMinorConsent(db, userId);
    return privateJson({ consent });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return privateJson({ error: error.message }, error.status);
    }
    throw error;
  }
}

/** HTTP behavior for POST /api/me/consent. */
export async function handlePostConsent(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ConsentError("Invalid JSON body.");
    }
    const consent = await recordMinorConsent(db, userId, body);
    return privateJson({ ok: true, consent });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return privateJson({ error: error.message }, error.status);
    }
    if (error instanceof ConsentError) {
      return privateJson({ error: error.message }, error.status);
    }
    throw error;
  }
}

export type { GuardianRelationship };
