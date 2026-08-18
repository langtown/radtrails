/**
 * ID token validation.
 *
 * This is the security boundary of the whole sign-in: everything downstream
 * trusts the `sub` claim that comes out of here. A token is only accepted if
 * its signature verifies against Google's published keys AND its issuer,
 * audience, expiry, and nonce all check out. Any failure throws.
 */

export class IdTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdTokenError";
  }
}

/** Google publishes its signing keys here; listed in the discovery document. */
export const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

const VALID_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleIdTokenClaims = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
};

/** Workers' JsonWebKey type omits `kid`, which is how we select a key. */
type SigningJwk = JsonWebKey & { kid?: string };

export type JsonWebKeySet = { keys: SigningJwk[] };

/**
 * Backed by an explicit ArrayBuffer: Web Crypto requires a BufferSource over
 * ArrayBuffer, and `Uint8Array.from` yields ArrayBufferLike, which is not the
 * same type.
 */
function base64UrlDecode(segment: string): Uint8Array<ArrayBuffer> {
  const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeJsonSegment(segment: string): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
  } catch {
    throw new IdTokenError("malformed token segment");
  }
}

export async function verifyIdToken({
  idToken,
  clientId,
  nonce,
  jwks,
  now = new Date(),
}: {
  idToken: string;
  clientId: string;
  nonce: string;
  jwks: JsonWebKeySet;
  now?: Date;
}): Promise<GoogleIdTokenClaims> {
  const segments = idToken.split(".");
  if (segments.length !== 3) {
    throw new IdTokenError("token is not a well-formed JWT");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJsonSegment(encodedHeader);

  // Reject anything but RS256 before touching the signature. Accepting the
  // header's own algorithm claim is how `alg: none` forgeries get through.
  if (header.alg !== "RS256") {
    throw new IdTokenError(`unsupported token algorithm: ${header.alg}`);
  }

  const key = jwks.keys.find((candidate) => candidate.kid === header.kid);
  if (!key) {
    throw new IdTokenError(`no signing key matches key id ${header.kid}`);
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signatureValid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  if (!signatureValid) {
    throw new IdTokenError("token signature does not verify");
  }

  // Only now are the claims worth reading.
  const claims = decodeJsonSegment(encodedPayload);

  if (typeof claims.iss !== "string" || !VALID_ISSUERS.includes(claims.iss)) {
    throw new IdTokenError(`unexpected token issuer: ${claims.iss}`);
  }

  if (claims.aud !== clientId) {
    throw new IdTokenError("token audience is not this application");
  }

  if (typeof claims.exp !== "number") {
    throw new IdTokenError("token has no expiry");
  }

  if (claims.exp * 1000 <= now.getTime()) {
    throw new IdTokenError("token has expired");
  }

  if (claims.nonce !== nonce) {
    throw new IdTokenError("token nonce does not match this sign-in");
  }

  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new IdTokenError("token has no subject claim");
  }

  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    emailVerified:
      typeof claims.email_verified === "boolean"
        ? claims.email_verified
        : undefined,
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  };
}

/**
 * Google rotates signing keys, so the key set is fetched rather than pinned.
 * Cached for the lifetime of the isolate to avoid a round trip on every login.
 */
let cachedJwks: { value: JsonWebKeySet; expiresAt: number } | null = null;

export async function fetchGoogleJwks(
  fetchImpl: typeof fetch = fetch,
): Promise<JsonWebKeySet> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) {
    return cachedJwks.value;
  }

  const response = await fetchImpl(GOOGLE_JWKS_URI);
  if (!response.ok) {
    throw new IdTokenError(
      `could not fetch Google signing keys (${response.status})`,
    );
  }

  const value = (await response.json()) as JsonWebKeySet;

  // Respect Cache-Control when Google sends it; fall back to an hour.
  const maxAge = Number(
    response.headers.get("Cache-Control")?.match(/max-age=(\d+)/)?.[1] ?? 3600,
  );
  cachedJwks = { value, expiresAt: Date.now() + maxAge * 1000 };

  return value;
}
