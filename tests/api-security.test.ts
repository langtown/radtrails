import { expect, test } from "vitest";

import {
  apiBoundaryResponse,
  corsHeaders,
  rateLimitResponse,
  secureApiResponse,
  type RateLimitBinding,
} from "@/lib/api-security";

class CountingLimiter implements RateLimitBinding {
  readonly keys: string[] = [];

  constructor(private readonly allowance: number) {}

  async limit({ key }: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(key);
    return { success: this.keys.length <= this.allowance };
  }
}

test("same-origin state-changing requests pass the CSRF boundary", () => {
  const request = new Request("https://radtrails.org/api/profile", {
    method: "PUT",
    headers: { Origin: "https://radtrails.org" },
  });

  expect(apiBoundaryResponse(request)).toBeNull();
});

test("missing and cross-origin origins are rejected on mutations", async () => {
  const missing = apiBoundaryResponse(
    new Request("https://radtrails.org/api/profile", { method: "PUT" }),
  );
  const hostile = apiBoundaryResponse(
    new Request("https://radtrails.org/api/profile", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    }),
  );

  expect(missing?.status).toBe(403);
  expect(hostile?.status).toBe(403);
  await expect(hostile?.json()).resolves.toEqual({
    error: "cross-origin request rejected",
  });
  expect(hostile?.headers.get("Cache-Control")).toBe("no-store");
});

test("safe reads do not require an Origin header", () => {
  expect(
    apiBoundaryResponse(
      new Request("https://radtrails.org/api/profiles?persona=theteam"),
    ),
  ).toBeNull();
});

test("preflight allows only the API's own origin and never emits a wildcard", () => {
  const allowed = apiBoundaryResponse(
    new Request("https://radtrails.org/api/profile", {
      method: "OPTIONS",
      headers: { Origin: "https://radtrails.org" },
    }),
  );
  const blocked = apiBoundaryResponse(
    new Request("https://radtrails.org/api/profile", {
      method: "OPTIONS",
      headers: { Origin: "https://other.example" },
    }),
  );

  expect(allowed?.status).toBe(204);
  expect(allowed?.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://radtrails.org",
  );
  expect(allowed?.headers.get("Access-Control-Allow-Credentials")).toBe(
    "true",
  );
  expect(allowed?.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  expect(blocked?.status).toBe(403);
  expect(blocked?.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

test("CORS response headers are restricted to a matching origin", () => {
  const sameOrigin = corsHeaders(
    new Request("https://radtrails.org/api/me", {
      headers: { Origin: "https://radtrails.org" },
    }),
  );
  const crossOrigin = corsHeaders(
    new Request("https://radtrails.org/api/me", {
      headers: { Origin: "https://evil.example" },
    }),
  );

  expect(sameOrigin.get("Access-Control-Allow-Origin")).toBe(
    "https://radtrails.org",
  );
  expect(sameOrigin.get("Access-Control-Allow-Credentials")).toBe("true");
  expect(crossOrigin.get("Access-Control-Allow-Origin")).toBeNull();
  expect([...sameOrigin.values()]).not.toContain("*");
  expect([...crossOrigin.values()]).not.toContain("*");
});

test("the secure route wrapper calls a handler once and preserves its response", async () => {
  let calls = 0;
  const response = await secureApiResponse(
    new Request("https://radtrails.org/api/me", {
      headers: { Origin: "https://radtrails.org" },
    }),
    () => {
      calls += 1;
      return Response.json(
        { ok: true },
        { status: 201, headers: { "Cache-Control": "private, no-store" } },
      );
    },
  );

  expect(calls).toBe(1);
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://radtrails.org",
  );
  await expect(response.json()).resolves.toEqual({ ok: true });
});

test("the secure route wrapper preserves multiple Set-Cookie headers", async () => {
  const headers = new Headers();
  headers.append("Set-Cookie", "session=one; Path=/; HttpOnly");
  headers.append("Set-Cookie", "oauth=; Path=/api/auth; Max-Age=0");

  const response = await secureApiResponse(
    new Request("https://radtrails.org/api/auth/callback"),
    () => new Response(null, { status: 302, headers }),
  );

  expect(response.headers.getSetCookie()).toEqual([
    "session=one; Path=/; HttpOnly",
    "oauth=; Path=/api/auth; Max-Age=0",
  ]);
});

test("rate limits key trusted Cloudflare client IPs by endpoint group", async () => {
  const limiter = new CountingLimiter(2);
  const request = new Request("https://radtrails.org/api/profile", {
    headers: { "CF-Connecting-IP": "203.0.113.8" },
  });

  expect(await rateLimitResponse(request, limiter, "profile-write", 60)).toBeNull();
  expect(await rateLimitResponse(request, limiter, "profile-write", 60)).toBeNull();
  const refused = await rateLimitResponse(
    request,
    limiter,
    "profile-write",
    60,
  );

  expect(limiter.keys).toEqual([
    "profile-write:203.0.113.8",
    "profile-write:203.0.113.8",
    "profile-write:203.0.113.8",
  ]);
  expect(refused?.status).toBe(429);
  expect(refused?.headers.get("Retry-After")).toBe("60");
  expect(refused?.headers.get("Cache-Control")).toBe("no-store");
});

test("development remains usable when a rate-limit binding is unavailable", async () => {
  const response = await rateLimitResponse(
    new Request("http://localhost:3000/api/auth/login"),
    undefined,
    "login-start",
    60,
  );

  expect(response).toBeNull();
});
