import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getDb } from "@/lib/db";
import { fetchGoogleJwks, verifyIdToken } from "@/lib/id-token";
import {
  buildClearedTransactionCookie,
  exchangeCodeForTokens,
  readOAuthTransaction,
} from "@/lib/oauth";
import { buildSessionCookie, createSession } from "@/lib/session";
import { upsertUserFromGoogle } from "@/lib/users";

/** Where a signed-in user lands. */
const POST_LOGIN_PATH = "/";

function failed(reason: string, secure: boolean): Response {
  // Never echo Google's raw error into the page; log-worthy detail stays
  // server-side and the user gets a stable, non-leaky destination.
  console.error(`sign-in failed: ${reason}`);

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/?signin=failed",
      "Set-Cookie": buildClearedTransactionCookie({ secure }),
    },
  });
}

async function finishLogin(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const secure = origin.startsWith("https://");

  // Google reports user-facing refusals (for example consent denied) here.
  const googleError = url.searchParams.get("error");
  if (googleError) return failed(`google returned ${googleError}`, secure);

  const transaction = readOAuthTransaction(request);
  if (!transaction) {
    return failed("no sign-in transaction cookie; it may have expired", secure);
  }

  const state = url.searchParams.get("state");
  if (!state || state !== transaction.state) {
    return failed("state did not match the value we issued", secure);
  }

  const code = url.searchParams.get("code");
  if (!code) return failed("no authorization code in the callback", secure);

  const { env } = await getCloudflareContext({ async: true });
  const limited = await rateLimitResponse(
    request,
    env.LOGIN_RATE_LIMITER,
    "login-callback",
    60,
  );
  if (limited) return limited;

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return failed("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set", secure);
  }

  try {
    const { idToken } = await exchangeCodeForTokens({
      code,
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${origin}/api/auth/callback`,
      codeVerifier: transaction.codeVerifier,
    });

    const claims = await verifyIdToken({
      idToken,
      clientId: env.GOOGLE_CLIENT_ID,
      nonce: transaction.nonce,
      jwks: await fetchGoogleJwks(),
    });

    const db = await getDb();
    const { userId } = await upsertUserFromGoogle(db, claims);
    const session = await createSession(db, userId);

    const headers = new Headers({ Location: POST_LOGIN_PATH });
    headers.append(
      "Set-Cookie",
      buildSessionCookie({ ...session, secure }),
    );
    // The transaction is single-use; drop it the moment it is spent.
    headers.append("Set-Cookie", buildClearedTransactionCookie({ secure }));

    return new Response(null, { status: 302, headers });
  } catch (error) {
    return failed(
      error instanceof Error ? error.message : "unexpected error",
      secure,
    );
  }
}

export function GET(request: Request) {
  return secureApiResponse(request, () => finishLogin(request));
}

export { handleApiOptions as OPTIONS };
