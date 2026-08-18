/**
 * The Google side of sign-in: building the authorization request, and carrying
 * the one-time values that make the callback verifiable.
 *
 * Endpoints come from Google's discovery document at
 * https://accounts.google.com/.well-known/openid-configuration
 */

export const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Only non-sensitive scopes. These three are what exempt the app from Google
 * verification, the 100-user cap, and the unverified-app warning screen.
 * Adding anything else forfeits all three — see docs/authentication.md.
 */
export const GOOGLE_SCOPES = "openid email profile";

export const OAUTH_TRANSACTION_COOKIE_NAME = "rad_oauth_tx";

/** Long enough to sign in, short enough that an abandoned attempt expires. */
const TRANSACTION_TTL_SECONDS = 600;

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomToken(byteLength = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function s256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );

  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * The values we must remember between sending the user to Google and Google
 * sending them back. Held in a short-lived cookie rather than D1: it is
 * per-browser, expires on its own, and costs no database writes.
 */
export type OAuthTransaction = {
  /** Echoed by Google; proves the callback answers a request we started. */
  state: string;
  /** Embedded in the ID token; proves the token is not a replay. */
  nonce: string;
  /** Proves the code is redeemed by whoever requested it. Never sent to Google. */
  codeVerifier: string;
};

export type AuthorizationRequest = {
  url: string;
  transaction: OAuthTransaction;
};

export async function createAuthorizationRequest({
  clientId,
  redirectUri,
}: {
  clientId: string;
  redirectUri: string;
}): Promise<AuthorizationRequest> {
  const transaction: OAuthTransaction = {
    state: randomToken(),
    nonce: randomToken(),
    // 32 bytes base64url encodes to 43 characters, the RFC 7636 minimum.
    codeVerifier: randomToken(32),
  };

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: await s256Challenge(transaction.codeVerifier),
    code_challenge_method: "S256",
  });

  return {
    url: `${GOOGLE_AUTHORIZATION_ENDPOINT}?${params.toString()}`,
    transaction,
  };
}

export class TokenExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenExchangeError";
  }
}

/**
 * Trades the authorization code for tokens.
 *
 * Server-to-server: this is the only place the client secret is used, and the
 * browser never sees this request. The code verifier travels here — not in the
 * original redirect — which is what makes an intercepted code useless.
 */
export async function exchangeCodeForTokens({
  code,
  clientId,
  clientSecret,
  redirectUri,
  codeVerifier,
  fetchImpl = fetch,
}: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}): Promise<{ idToken: string }> {
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
    }).toString(),
  });

  const body = (await response.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    // Surface Google's own error code — `invalid_client` means a bad secret,
    // and guessing at that from a generic failure wastes an afternoon.
    throw new TokenExchangeError(
      `Google rejected the token exchange (${response.status}): ` +
        `${body.error ?? "unknown error"}${
          body.error_description ? ` — ${body.error_description}` : ""
        }`,
    );
  }

  if (!body.id_token) {
    throw new TokenExchangeError("token response contained no id token");
  }

  return { idToken: body.id_token };
}

function transactionCookieAttributes(secure: boolean): string[] {
  const attributes = [
    "Path=/api/auth",
    "HttpOnly",
    // Lax, not Strict: Strict would withhold the cookie on Google's redirect
    // back to us, breaking every sign-in.
    "SameSite=Lax",
  ];

  if (secure) attributes.push("Secure");

  return attributes;
}

export function buildOAuthTransactionCookie(
  transaction: OAuthTransaction,
  { secure = true }: { secure?: boolean } = {},
): string {
  const encoded = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(transaction)),
  );

  return [
    `${OAUTH_TRANSACTION_COOKIE_NAME}=${encoded}`,
    ...transactionCookieAttributes(secure),
    `Max-Age=${TRANSACTION_TTL_SECONDS}`,
  ].join("; ");
}

export function buildClearedTransactionCookie({
  secure = true,
}: { secure?: boolean } = {}): string {
  return [
    `${OAUTH_TRANSACTION_COOKIE_NAME}=`,
    ...transactionCookieAttributes(secure),
    "Max-Age=0",
  ].join("; ");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }

  return null;
}

/**
 * Reads back the transaction. Returns null rather than throwing on anything
 * malformed — a corrupted or forged cookie is just a failed sign-in, and the
 * callback already refuses to proceed without a transaction.
 */
export function readOAuthTransaction(
  request: Request,
): OAuthTransaction | null {
  const raw = readCookie(request, OAUTH_TRANSACTION_COOKIE_NAME);
  if (!raw) return null;

  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)),
    );
    const parsed = JSON.parse(json) as Partial<OAuthTransaction>;

    if (
      typeof parsed.state !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.codeVerifier !== "string"
    ) {
      return null;
    }

    return {
      state: parsed.state,
      nonce: parsed.nonce,
      codeVerifier: parsed.codeVerifier,
    };
  } catch {
    return null;
  }
}
