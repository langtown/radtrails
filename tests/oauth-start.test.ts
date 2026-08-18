import { expect, test } from "vitest";

import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  OAUTH_TRANSACTION_COOKIE_NAME,
  buildOAuthTransactionCookie,
  buildClearedTransactionCookie,
  createAuthorizationRequest,
  readOAuthTransaction,
} from "@/lib/oauth";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const REDIRECT_URI = "https://radtrails.org/api/auth/callback";

function start() {
  return createAuthorizationRequest({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
  });
}

/** Independently recompute the PKCE challenge from the verifier. */
async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

test("sends the browser to Google's authorization endpoint", async () => {
  const { url } = await start();

  expect(url.startsWith(GOOGLE_AUTHORIZATION_ENDPOINT)).toBe(true);
});

test("asks for an authorization code, not an implicit token", async () => {
  const { url } = await start();

  expect(new URL(url).searchParams.get("response_type")).toBe("code");
});

test("requests only the three non-sensitive scopes", async () => {
  const { url } = await start();

  // Anything beyond these pulls the app into Google verification.
  expect(new URL(url).searchParams.get("scope")).toBe("openid email profile");
});

test("carries the client id and the exact registered redirect uri", async () => {
  const { url } = await start();
  const params = new URL(url).searchParams;

  expect(params.get("client_id")).toBe(CLIENT_ID);
  expect(params.get("redirect_uri")).toBe(REDIRECT_URI);
});

test("carries the state and nonce it generated", async () => {
  const { url, transaction } = await start();
  const params = new URL(url).searchParams;

  expect(params.get("state")).toBe(transaction.state);
  expect(params.get("nonce")).toBe(transaction.nonce);
});

test("uses PKCE with S256, never plain", async () => {
  const { url } = await start();

  expect(new URL(url).searchParams.get("code_challenge_method")).toBe("S256");
});

test("the code challenge is the S256 hash of the verifier it kept", async () => {
  const { url, transaction } = await start();

  expect(new URL(url).searchParams.get("code_challenge")).toBe(
    await s256(transaction.codeVerifier),
  );
});

test("the verifier stays within the length RFC 7636 allows", async () => {
  const { transaction } = await start();

  expect(transaction.codeVerifier.length).toBeGreaterThanOrEqual(43);
  expect(transaction.codeVerifier.length).toBeLessThanOrEqual(128);
});

test("never reuses state, nonce, or verifier between sign-ins", async () => {
  const first = await start();
  const second = await start();

  expect(first.transaction.state).not.toBe(second.transaction.state);
  expect(first.transaction.nonce).not.toBe(second.transaction.nonce);
  expect(first.transaction.codeVerifier).not.toBe(
    second.transaction.codeVerifier,
  );
});

test("the verifier never appears in the URL sent to Google", async () => {
  const { url, transaction } = await start();

  // Only the hash may travel; leaking the verifier would defeat PKCE.
  expect(url).not.toContain(transaction.codeVerifier);
});

test("the transaction cookie round-trips through a request", async () => {
  const { transaction } = await start();
  const cookie = buildOAuthTransactionCookie(transaction);
  const value = cookie.split(";")[0].split("=").slice(1).join("=");

  const request = new Request("https://radtrails.org/api/auth/callback", {
    headers: { Cookie: `${OAUTH_TRANSACTION_COOKIE_NAME}=${value}` },
  });

  expect(readOAuthTransaction(request)).toEqual(transaction);
});

test("the transaction cookie is HttpOnly, Lax, and short lived", async () => {
  const { transaction } = await start();

  const cookie = buildOAuthTransactionCookie(transaction);

  expect(cookie).toContain("HttpOnly");
  // Lax, not Strict: the cookie must survive Google's redirect back to us.
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("Secure");
  expect(cookie).toMatch(/Max-Age=\d+/);
  const maxAge = Number(cookie.match(/Max-Age=(\d+)/)![1]);
  expect(maxAge).toBeLessThanOrEqual(600);
});

test("the transaction cookie can be dropped for local http development", async () => {
  const { transaction } = await start();

  const cookie = buildOAuthTransactionCookie(transaction, { secure: false });

  expect(cookie).not.toContain("Secure");
});

test("a request with no transaction cookie reads as null", () => {
  const request = new Request("https://radtrails.org/api/auth/callback");

  expect(readOAuthTransaction(request)).toBeNull();
});

test("a tampered transaction cookie reads as null rather than throwing", () => {
  const request = new Request("https://radtrails.org/api/auth/callback", {
    headers: { Cookie: `${OAUTH_TRANSACTION_COOKIE_NAME}=not-valid-base64!!` },
  });

  expect(readOAuthTransaction(request)).toBeNull();
});

test("the cleared transaction cookie expires immediately", () => {
  const cookie = buildClearedTransactionCookie();

  expect(cookie).toContain(`${OAUTH_TRANSACTION_COOKIE_NAME}=;`);
  expect(cookie).toContain("Max-Age=0");
});
