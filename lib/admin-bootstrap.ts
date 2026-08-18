import {
  AuthenticationError,
  requireAuthenticatedUser,
} from "./auth";
import {
  MAX_ADMIN_BOOTSTRAP_REQUEST_BYTES,
  MAX_ADMIN_BOOTSTRAP_TOKEN_CHARACTERS,
  MIN_ADMIN_BOOTSTRAP_TOKEN_BYTES,
} from "./admin-bootstrap-constraints";
import { hasAnyAdmin } from "./persona-admin";

const PRIVATE_NO_STORE = "private, no-store";

export class AdminBootstrapError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminBootstrapError";
    this.status = status;
  }
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("Content-Type"))) {
    throw new AdminBootstrapError(
      "Content-Type must be application/json",
      415,
    );
  }

  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isFinite(bytes) || bytes < 0) {
      throw new AdminBootstrapError("invalid Content-Length", 400);
    }
    if (bytes > MAX_ADMIN_BOOTSTRAP_REQUEST_BYTES) {
      throw new AdminBootstrapError("admin setup request is too large", 413);
    }
  }

  if (!request.body) {
    throw new AdminBootstrapError("a JSON body is required", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > MAX_ADMIN_BOOTSTRAP_REQUEST_BYTES) {
        await reader.cancel();
        throw new AdminBootstrapError("admin setup request is too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AdminBootstrapError("request body must be valid UTF-8", 400);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AdminBootstrapError("request body must be valid JSON", 400);
  }
}

function normalizeBootstrapCode(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminBootstrapError("admin setup body must be an object", 400);
  }

  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    !Object.hasOwn(record, "code")
  ) {
    throw new AdminBootstrapError(
      "admin setup body must contain only code",
      400,
    );
  }
  if (typeof record.code !== "string") {
    throw new AdminBootstrapError("admin setup code must be a string", 400);
  }

  const code = record.code.trim();
  if (code.length === 0) {
    throw new AdminBootstrapError("admin setup code is required", 400);
  }
  if (Array.from(code).length > MAX_ADMIN_BOOTSTRAP_TOKEN_CHARACTERS) {
    throw new AdminBootstrapError("admin setup code is too long", 400);
  }
  if (/\p{C}/u.test(code)) {
    throw new AdminBootstrapError(
      "admin setup code contains unsupported characters",
      400,
    );
  }

  return code;
}

function normalizeConfiguredToken(value: string | undefined): string {
  const token = value?.trim() ?? "";
  const byteLength = new TextEncoder().encode(token).byteLength;
  if (
    byteLength < MIN_ADMIN_BOOTSTRAP_TOKEN_BYTES ||
    Array.from(token).length > MAX_ADMIN_BOOTSTRAP_TOKEN_CHARACTERS
  ) {
    throw new AdminBootstrapError(
      "admin setup is not configured with a sufficiently strong token",
      503,
    );
  }
  return token;
}

async function timingSafeTokenMatch(
  provided: string,
  configured: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, configuredHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(configured)),
  ]);

  // Cloudflare's current runtime provides timingSafeEqual, although the DOM
  // SubtleCrypto declaration selected by Next.js does not expose it yet.
  if (
    "timingSafeEqual" in crypto.subtle &&
    typeof crypto.subtle.timingSafeEqual === "function"
  ) {
    return crypto.subtle.timingSafeEqual(providedHash, configuredHash);
  }

  // Both SHA-256 outputs are fixed at 32 bytes, so this fallback never exits
  // early based on a matching prefix or a caller-controlled length.
  const providedBytes = new Uint8Array(providedHash);
  const configuredBytes = new Uint8Array(configuredHash);
  let difference = 0;
  for (let index = 0; index < providedBytes.length; index += 1) {
    difference |= providedBytes[index] ^ configuredBytes[index];
  }
  return difference === 0;
}

/**
 * Atomically grants the first admin to the authenticated user.
 *
 * The NOT EXISTS guard lives in the INSERT itself. Two simultaneous requests
 * cannot both pass a separate count-then-write race and create two bootstrap
 * administrators.
 */
export async function claimFirstAdmin(
  db: D1Database,
  userId: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO user_personas (user_id, persona_key, granted_by)
       SELECT ?, 'admin', NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM user_personas WHERE persona_key = 'admin'
       )
       ON CONFLICT (user_id, persona_key) DO NOTHING`,
    )
    .bind(userId)
    .run();

  return (result.meta.changes ?? 0) === 1;
}

/** HTTP behavior for the one-time POST /api/admin/bootstrap endpoint. */
export async function handleBootstrapAdmin(
  db: D1Database,
  request: Request,
  configuredToken: string | undefined,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);

    if (await hasAnyAdmin(db)) {
      throw new AdminBootstrapError(
        "initial admin setup has already been completed",
        409,
      );
    }

    const expected = normalizeConfiguredToken(configuredToken);
    const provided = normalizeBootstrapCode(await readBoundedJson(request));
    if (!(await timingSafeTokenMatch(provided, expected))) {
      throw new AdminBootstrapError("admin setup code is not valid", 403);
    }

    if (!(await claimFirstAdmin(db, userId))) {
      throw new AdminBootstrapError(
        "initial admin setup has already been completed",
        409,
      );
    }

    return privateJson({ ok: true, persona: "admin" }, 201);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AdminBootstrapError
    ) {
      return privateJson({ error: error.message }, error.status);
    }
    throw error;
  }
}
