import {
  AuthenticationError,
  requireAuthenticatedUser,
} from "./auth";

/** Maximum number of independent key/value rows one account may own. */
export const MAX_DATA_ENTRIES = 64;

/** Keys are identifiers, not document storage. */
export const MAX_DATA_KEY_BYTES = 128;

/** 64 entries at this size keep one account near 1 MiB before row overhead. */
export const MAX_DATA_VALUE_BYTES = 16 * 1024;

/** Allows normal JSON escaping while bounding memory before JSON.parse(). */
export const MAX_DATA_REQUEST_BYTES = 64 * 1024;

const PRIVATE_NO_STORE = "private, no-store";
const utf8 = new TextEncoder();

export class UserDataError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UserDataError";
    this.status = status;
  }
}

type UserDataRow = {
  key: string;
  value: string | null;
  updatedAt: string;
};

type PutData = {
  key: string;
  value: string;
};

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

function errorResponse(error: unknown): Response | null {
  if (error instanceof AuthenticationError || error instanceof UserDataError) {
    return privateJson({ error: error.message }, error.status);
  }

  return null;
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;

  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

/**
 * Reads JSON without ever buffering an unbounded request body. Content-Length
 * is only an early rejection; the stream counter remains authoritative for
 * chunked requests and dishonest headers.
 */
async function readBoundedJson(request: Request): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("Content-Type"))) {
    throw new UserDataError("Content-Type must be application/json", 415);
  }

  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isFinite(bytes) || bytes < 0) {
      throw new UserDataError("invalid Content-Length", 400);
    }
    if (bytes > MAX_DATA_REQUEST_BYTES) {
      throw new UserDataError("request body is too large", 413);
    }
  }

  if (!request.body) throw new UserDataError("a JSON body is required", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > MAX_DATA_REQUEST_BYTES) {
        await reader.cancel();
        throw new UserDataError("request body is too large", 413);
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
    throw new UserDataError("request body must be valid UTF-8", 400);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new UserDataError("request body must be valid JSON", 400);
  }
}

function validatePutData(input: unknown): PutData {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new UserDataError("body must be an object with key and value", 400);
  }

  const record = input as Record<string, unknown>;
  const fields = Object.keys(record);
  if (
    fields.length !== 2 ||
    !Object.hasOwn(record, "key") ||
    !Object.hasOwn(record, "value")
  ) {
    throw new UserDataError("body may contain only key and value", 400);
  }

  if (typeof record.key !== "string" || typeof record.value !== "string") {
    throw new UserDataError("key and value must both be strings", 400);
  }

  const { key, value } = record;
  if (!key || key.trim() !== key || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new UserDataError(
      "key must be non-empty, trimmed, and contain no control characters",
      400,
    );
  }

  if (utf8.encode(key).byteLength > MAX_DATA_KEY_BYTES) {
    throw new UserDataError("key is too large", 413);
  }
  if (utf8.encode(value).byteLength > MAX_DATA_VALUE_BYTES) {
    throw new UserDataError("value is too large", 413);
  }

  return { key, value };
}

export async function listUserData(
  db: D1Database,
  userId: number,
): Promise<UserDataRow[]> {
  const { results } = await db
    .prepare(
      `SELECT data_key, data_value, updated_at
       FROM user_data
       WHERE user_id = ?
       ORDER BY data_key`,
    )
    .bind(userId)
    .all<{
      data_key: string;
      data_value: string | null;
      updated_at: string;
    }>();

  return results.map((row) => ({
    key: row.data_key,
    value: row.data_value,
    updatedAt: row.updated_at,
  }));
}

export async function putUserData(
  db: D1Database,
  userId: number,
  { key, value }: PutData,
): Promise<void> {
  // One statement keeps the entry cap and upsert atomic. Existing keys remain
  // editable at the cap; only creation of a 65th key is refused.
  const result = await db
    .prepare(
      `INSERT INTO user_data (user_id, data_key, data_value)
       SELECT ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM user_data WHERE user_id = ? AND data_key = ?
       ) OR (
         SELECT COUNT(*) FROM user_data WHERE user_id = ?
       ) < ?
       ON CONFLICT (user_id, data_key) DO UPDATE SET
         data_value = excluded.data_value,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userId, key, value, userId, key, userId, MAX_DATA_ENTRIES)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new UserDataError(
      `an account may store at most ${MAX_DATA_ENTRIES} keys`,
      409,
    );
  }
}

/** HTTP behavior for GET /api/data, separated for real-D1 tests. */
export async function handleGetData(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    return privateJson({ data: await listUserData(db, userId) });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** HTTP behavior for PUT /api/data, separated for real-D1 tests. */
export async function handlePutData(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    const data = validatePutData(await readBoundedJson(request));
    await putUserData(db, userId, data);

    return privateJson(data);
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}
