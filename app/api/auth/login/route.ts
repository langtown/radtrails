import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import {
  buildOAuthTransactionCookie,
  createAuthorizationRequest,
} from "@/lib/oauth";

/**
 * Starts the Google sign-in handshake.
 *
 * Thin adapter: everything worth testing lives in lib/oauth.ts. This only
 * reads configuration, builds the redirect, and attaches the transaction
 * cookie the callback will need.
 */
async function startLogin(request: Request) {
  const { env } = await getCloudflareContext({ async: true });

  const limited = await rateLimitResponse(
    request,
    env.LOGIN_RATE_LIMITER,
    "login-start",
    60,
  );
  if (limited) return limited;

  if (!env.GOOGLE_CLIENT_ID) {
    // Configuration error, not a user error — say so plainly rather than
    // bouncing someone to Google with an empty client_id.
    return Response.json(
      { error: "sign-in is not configured: GOOGLE_CLIENT_ID is missing" },
      { status: 500 },
    );
  }

  // Derived from the incoming request so localhost and production each get
  // their own registered URI without a second config value to keep in sync.
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/callback`;
  const secure = origin.startsWith("https://");

  const { url, transaction } = await createAuthorizationRequest({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": buildOAuthTransactionCookie(transaction, { secure }),
    },
  });
}

export function GET(request: Request) {
  return secureApiResponse(request, () => startLogin(request));
}

export { handleApiOptions as OPTIONS };
