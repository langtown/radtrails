import { expect, test } from "vitest";

import {
  GOOGLE_TOKEN_ENDPOINT,
  TokenExchangeError,
  exchangeCodeForTokens,
} from "@/lib/oauth";

const ARGS = {
  code: "auth-code-123",
  clientId: "test-client-id.apps.googleusercontent.com",
  clientSecret: "test-client-secret",
  redirectUri: "https://radtrails.org/api/auth/callback",
  codeVerifier: "test-code-verifier",
};

/** Captures the outgoing request so we can assert on what Google would see. */
function stubFetch(
  response: Response,
): { calls: { url: string; body: URLSearchParams }[]; impl: typeof fetch } {
  const calls: { url: string; body: URLSearchParams }[] = [];

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: new URLSearchParams(String(init?.body ?? "")),
    });
    return response;
  }) as typeof fetch;

  return { calls, impl };
}

function okResponse(body: Record<string, unknown> = { id_token: "the.id.token" }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("posts the code to Google's token endpoint", async () => {
  const { calls, impl } = stubFetch(okResponse());

  await exchangeCodeForTokens({ ...ARGS, fetchImpl: impl });

  expect(calls[0].url).toBe(GOOGLE_TOKEN_ENDPOINT);
  expect(calls[0].body.get("code")).toBe(ARGS.code);
  expect(calls[0].body.get("grant_type")).toBe("authorization_code");
});

test("proves possession with the PKCE verifier", async () => {
  const { calls, impl } = stubFetch(okResponse());

  await exchangeCodeForTokens({ ...ARGS, fetchImpl: impl });

  expect(calls[0].body.get("code_verifier")).toBe(ARGS.codeVerifier);
});

test("sends the client secret server-to-server", async () => {
  const { calls, impl } = stubFetch(okResponse());

  await exchangeCodeForTokens({ ...ARGS, fetchImpl: impl });

  expect(calls[0].body.get("client_secret")).toBe(ARGS.clientSecret);
  expect(calls[0].body.get("client_id")).toBe(ARGS.clientId);
});

test("sends the same redirect uri Google already validated", async () => {
  const { calls, impl } = stubFetch(okResponse());

  await exchangeCodeForTokens({ ...ARGS, fetchImpl: impl });

  expect(calls[0].body.get("redirect_uri")).toBe(ARGS.redirectUri);
});

test("returns the id token from a successful exchange", async () => {
  const { impl } = stubFetch(okResponse({ id_token: "returned.id.token" }));

  const result = await exchangeCodeForTokens({ ...ARGS, fetchImpl: impl });

  expect(result.idToken).toBe("returned.id.token");
});

test("fails loudly when Google rejects the exchange", async () => {
  const { impl } = stubFetch(
    new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 }),
  );

  await expect(
    exchangeCodeForTokens({ ...ARGS, fetchImpl: impl }),
  ).rejects.toBeInstanceOf(TokenExchangeError);
});

test("names the Google error so a misconfigured secret is diagnosable", async () => {
  const { impl } = stubFetch(
    new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 }),
  );

  await expect(
    exchangeCodeForTokens({ ...ARGS, fetchImpl: impl }),
  ).rejects.toThrow(/invalid_client/);
});

test("fails when the response carries no id token", async () => {
  const { impl } = stubFetch(okResponse({ access_token: "only-access" }));

  await expect(
    exchangeCodeForTokens({ ...ARGS, fetchImpl: impl }),
  ).rejects.toThrow(/id token/i);
});
