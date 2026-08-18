const SAFE_METHODS = new Set(["GET", "HEAD"]);
const ALLOWED_METHODS = "GET, HEAD, POST, PUT, OPTIONS";
const ALLOWED_HEADERS = "Content-Type";

export type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

function requestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return origin !== null && origin === requestOrigin(request);
}

export function corsHeaders(request: Request): Headers {
  const headers = new Headers({ Vary: "Origin" });
  if (isSameOrigin(request)) {
    headers.set("Access-Control-Allow-Origin", requestOrigin(request));
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  return headers;
}

function rejectedCrossOrigin(): Response {
  return Response.json(
    { error: "cross-origin request rejected" },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        Vary: "Origin",
      },
    },
  );
}

/**
 * Fast Route Handler boundary: CORS preflight plus Origin-based CSRF defense.
 * Authentication and authorization remain in each route handler.
 */
export function apiBoundaryResponse(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    if (!isSameOrigin(request)) return rejectedCrossOrigin();

    const headers = corsHeaders(request);
    headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    headers.set("Access-Control-Max-Age", "600");
    headers.set("Cache-Control", "private, max-age=600");
    return new Response(null, { status: 204, headers });
  }

  if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
    return rejectedCrossOrigin();
  }
  return null;
}

/** Runs an API handler behind the boundary and adds same-origin CORS headers. */
export async function secureApiResponse(
  request: Request,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  const boundary = apiBoundaryResponse(request);
  if (boundary) return boundary;

  const handled = await handler();
  const response = new Response(handled.body, handled);
  corsHeaders(request).forEach((value, name) => {
    response.headers.set(name, value);
  });
  return response;
}

export function handleApiOptions(request: Request): Response {
  return apiBoundaryResponse(request) ?? new Response(null, { status: 204 });
}

function clientKey(request: Request): string {
  // Cloudflare overwrites this header before the Worker runs. Never fall back
  // to X-Forwarded-For, which an Internet client can supply itself.
  return request.headers.get("CF-Connecting-IP") ?? "local-development";
}

export async function rateLimitResponse(
  request: Request,
  limiter: RateLimitBinding | undefined,
  endpointGroup: string,
  retryAfterSeconds: number,
): Promise<Response | null> {
  if (!limiter) return null;

  const { success } = await limiter.limit({
    key: `${endpointGroup}:${clientKey(request)}`,
  });
  if (success) return null;

  return Response.json(
    { error: "too many requests; please try again shortly" },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}
