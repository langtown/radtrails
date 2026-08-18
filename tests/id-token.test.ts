import { beforeAll, expect, test } from "vitest";

import {
  IdTokenError,
  type JsonWebKeySet,
  verifyIdToken,
} from "@/lib/id-token";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const NONCE = "test-nonce-value";
const KID = "test-key-1";

let keyPair: CryptoKeyPair;
let jwks: JsonWebKeySet;

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlJson(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Mints a token signed with our own key, so every claim can be varied. */
async function mintToken({
  payload = {},
  kid = KID,
  alg = "RS256",
  signingKey,
  tamper = false,
}: {
  payload?: Record<string, unknown>;
  kid?: string;
  alg?: string;
  signingKey?: CryptoKey;
  tamper?: boolean;
} = {}): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);

  const claims = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "google-sub-12345",
    nonce: NONCE,
    exp: nowSeconds + 3600,
    iat: nowSeconds,
    email: "rider@example.com",
    email_verified: true,
    name: "Test Rider",
    picture: "https://example.com/photo.jpg",
    ...payload,
  };

  const signingInput = `${b64urlJson({ alg, kid, typ: "JWT" })}.${b64urlJson(claims)}`;

  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    signingKey ?? keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );

  const encodedSignature = b64url(new Uint8Array(signature));

  if (tamper) {
    // Valid structure, wrong signature bytes.
    return `${signingInput}.${b64url(new Uint8Array(256))}`;
  }

  return `${signingInput}.${encodedSignature}`;
}

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;

  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  jwks = { keys: [{ ...publicJwk, kid: KID, alg: "RS256", use: "sig" }] };
});

function verify(idToken: string) {
  return verifyIdToken({ idToken, clientId: CLIENT_ID, nonce: NONCE, jwks });
}

test("accepts a properly signed token and returns its claims", async () => {
  const claims = await verify(await mintToken());

  expect(claims.sub).toBe("google-sub-12345");
  expect(claims.email).toBe("rider@example.com");
  expect(claims.name).toBe("Test Rider");
});

test("rejects a token signed by a different key", async () => {
  const attacker = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;

  await expect(
    verify(await mintToken({ signingKey: attacker.privateKey })),
  ).rejects.toBeInstanceOf(IdTokenError);
});

test("rejects a token whose signature has been tampered with", async () => {
  await expect(verify(await mintToken({ tamper: true }))).rejects.toBeInstanceOf(
    IdTokenError,
  );
});

test("rejects a token issued for a different application", async () => {
  await expect(
    verify(await mintToken({ payload: { aud: "someone-elses-client-id" } })),
  ).rejects.toThrow(/audience/i);
});

test("rejects a token from the wrong issuer", async () => {
  await expect(
    verify(await mintToken({ payload: { iss: "https://evil.example.com" } })),
  ).rejects.toThrow(/issuer/i);
});

test("accepts the bare accounts.google.com issuer form", async () => {
  const claims = await verify(
    await mintToken({ payload: { iss: "accounts.google.com" } }),
  );

  expect(claims.sub).toBe("google-sub-12345");
});

test("rejects an expired token", async () => {
  const expired = Math.floor(Date.now() / 1000) - 60;

  await expect(
    verify(await mintToken({ payload: { exp: expired } })),
  ).rejects.toThrow(/expired/i);
});

test("rejects a replayed token whose nonce does not match this sign-in", async () => {
  await expect(
    verify(await mintToken({ payload: { nonce: "a-different-nonce" } })),
  ).rejects.toThrow(/nonce/i);
});

test("rejects a token with no nonce at all", async () => {
  await expect(
    verify(await mintToken({ payload: { nonce: undefined } })),
  ).rejects.toThrow(/nonce/i);
});

test("rejects a token signed with an unknown key id", async () => {
  await expect(
    verify(await mintToken({ kid: "some-other-kid" })),
  ).rejects.toThrow(/key/i);
});

test("rejects the alg=none downgrade attack", async () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const unsigned = `${b64urlJson({ alg: "none", kid: KID, typ: "JWT" })}.${b64urlJson(
    {
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub: "attacker",
      nonce: NONCE,
      exp: nowSeconds + 3600,
    },
  )}.`;

  await expect(verify(unsigned)).rejects.toBeInstanceOf(IdTokenError);
});

test("rejects a token that is not three segments", async () => {
  await expect(verify("not.a-jwt")).rejects.toBeInstanceOf(IdTokenError);
});

test("rejects a token with no subject claim", async () => {
  await expect(
    verify(await mintToken({ payload: { sub: undefined } })),
  ).rejects.toThrow(/subject|sub/i);
});
