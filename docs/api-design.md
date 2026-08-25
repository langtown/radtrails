# API Design Blueprint

This is the canonical reference for how `/api/*` endpoints are built in this project. It exists so
new endpoints — written by a human or an agent — land in the same shape as the ones already here,
instead of each one improvising its own conventions. It documents the patterns this codebase already
uses; it does not introduce a new stack.

Originally drafted against a generic Hono + Zod blueprint. Adapted here to match what this project
actually runs: Next.js Route Handlers on OpenNext/Cloudflare, D1, and hand-written validation. If a
future project in this family uses Hono/Zod, write a separate blueprint for it — do not retrofit this
one, and do not introduce Hono/Zod into this codebase to match a blueprint that predates it.

## Tech Stack & Core Philosophy

* **Runtime**: Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare) (`npm run build`
  produces the Worker; plain `next build` does not — see `AGENTS.md`).
* **Framework**: Next.js App Router **Route Handlers** (`app/api/**/route.ts`), not a separate router
  library. Cloudflare bindings reach a handler through `getCloudflareContext()`, which only exists at
  request time inside the deployed/dev Worker — never inside the Vitest pool. This is *why* logic
  lives in `lib/`, not a style preference: code written directly in a route handler cannot be unit
  tested.
* **Language**: TypeScript, strict mode.
* **Validation**: Hand-written `validateX(input: unknown): X` functions, not Zod. Input shapes here
  are small (a handful of known fields), so a schema library adds a dependency without buying much;
  revisit if a payload's shape grows complex enough that manual checks get hard to read.
* **Testing**: Vitest + `@cloudflare/vitest-pool-workers`. Tests run inside workerd against a real
  in-memory D1 seeded from `migrations/` — not mocks. A migration that breaks a query fails the suite.

## Architecture & Directory Layout

Thin route handlers, pure testable domain functions. Same separation the original blueprint calls
for, expressed in this project's actual layout:

```text
app/api/<resource>/route.ts     # HTTP presentation layer — translates HTTP <-> lib/ calls only
lib/<resource>.ts               # Domain logic: validation, authorization, D1 queries
lib/db.ts                       # getAppRuntime()/getDb() — the only way a route reaches D1
lib/api-security.ts             # secureApiResponse/handleApiOptions — the shared HTTP boundary
tests/<resource>.test.ts        # Exercises lib/ functions against real D1 (mirrors lib/, not app/)
migrations/NNNN_description.sql # Checked-in schema changes, monotonically numbered
```

A route handler should read as a short list of: rate-limit check → call one `lib/` function →
translate the result to a `Response`. If a handler is doing more than that, the extra logic belongs in
`lib/`.

## Design Patterns & Guidelines

### 1. Domain logic is tested directly, HTTP is a thin wrapper

Every `lib/` function takes `D1Database` as its first argument and returns data or throws a typed
error — it doesn't know about `Request`/`Response`. Tests call these functions directly against the
real D1 instance from `cloudflare:test`. A `handleGet<X>`/`handlePost<X>` wrapper (see
`lib/user-data.ts`, `lib/profile-review.ts`) may live alongside the domain function when a route is
simple enough not to need its own file, but the validation and authorization inside it are still
independently callable and tested — see `grantPersona()` checking the grantor's `admin` persona
in `lib/personas.ts`, not only in the route.

### 2. Contract-driven input validation, without a schema library

Every endpoint payload gets one `validateX(input: unknown): X` function that:

* Rejects anything that isn't the expected shape (`typeof`, `Array.isArray`, object-with-only-known-keys).
* Rejects unknown fields explicitly — an allowlist check, not an ignore.
* Throws the resource's typed error class (see below) with a 400 status on any violation.

See `validatePutData()` in `lib/user-data.ts` and `normalizeReviewBody()` in `lib/profile-review.ts`
for the canonical shape.

### 3. Errors carry their own HTTP status

Each resource area defines one `Error` subclass with a `status: number` field
(`PersonaChangeError`, `ProfileReviewError`, `UserDataError`, ...). Domain functions throw it; the
route (or a small `errorResponse()` helper next to the domain function) catches it and maps straight
to `Response.json({ error: error.message }, { status: error.status })`. This keeps the *reason* for a
refusal defined once, in the domain function, instead of re-derived in every caller.

### 4. State and bindings

* Workers are stateless between requests. All persistence goes through D1, reached via
  `getAppRuntime()` / `getDb()` in `lib/db.ts` — never `getCloudflareContext()` directly in a route or
  in `lib/`.
* Rate limiter bindings come from `getAppRuntime().rateLimiters` and are declared in `wrangler.jsonc`
  under `ratelimits`. Check the limiter before touching D1 or authenticating, so a rejected burst
  stays cheap (see `app/api/data/route.ts`).
* Always use parameterized `db.prepare(...).bind(...)`. Never interpolate values into SQL text.

### 5. Every route runs through the shared security boundary

Every `/api/*` route wraps its handler in `secureApiResponse()` and exports `handleApiOptions` as
`OPTIONS`. That shared boundary in `lib/api-security.ts` enforces exact-origin CORS and rejects
cross-origin state-changing requests before any handler code runs. Do not hand-roll CORS headers or
skip the `OPTIONS` export on a new route.

### 6. Authorization lives in the domain function, not just the route

A check like "caller must hold `admin`" is written once, in `lib/`, and takes the actor id as a
parameter rather than trusting a caller-supplied flag — see `requireAdminUser()` in
`lib/persona-admin.ts`. This is what stops a future caller from bypassing authorization by invoking
the `lib/` function from a different route, a background job, or a test, instead of through HTTP.

## Canonical Code Implementations

### The domain layer (`lib/<resource>.ts`)

```typescript
export class WidgetError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WidgetError";
    this.status = status;
  }
}

type CreateWidget = { name: string };

function validateCreateWidget(input: unknown): CreateWidget {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new WidgetError("body must be an object", 400);
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "name")) {
    throw new WidgetError("body may contain only name", 400);
  }
  if (typeof record.name !== "string" || record.name.trim() === "") {
    throw new WidgetError("name is required", 400);
  }
  return { name: record.name.trim() };
}

export async function createWidget(
  db: D1Database,
  actorId: number,
  input: unknown,
): Promise<{ id: number; name: string }> {
  const { name } = validateCreateWidget(input);
  const result = await db
    .prepare("INSERT INTO widgets (name, created_by) VALUES (?, ?) RETURNING id")
    .bind(name, actorId)
    .first<{ id: number }>();
  return { id: result!.id, name };
}
```

### The route handler (`app/api/widgets/route.ts`)

```typescript
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { getAppRuntime } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/auth";
import { WidgetError, createWidget } from "@/lib/widgets";

export async function POST(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(request, rateLimiters.write, "widgets", 60);
    if (limited) return limited;

    try {
      const actorId = await requireAuthenticatedUser(db, request);
      const body = await request.json();
      const widget = await createWidget(db, actorId, body);
      return Response.json(widget, { status: 201 });
    } catch (error) {
      if (error instanceof WidgetError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  });
}

export { handleApiOptions as OPTIONS };
```

### The test (`tests/widgets.test.ts`)

```typescript
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createWidget, WidgetError } from "@/lib/widgets";

describe("createWidget", () => {
  it("stores a valid widget", async () => {
    const widget = await createWidget(env.DB, 1, { name: "Test" });
    expect(widget.name).toBe("Test");
  });

  it("rejects an empty name", async () => {
    await expect(createWidget(env.DB, 1, { name: "" })).rejects.toBeInstanceOf(WidgetError);
  });
});
```

## Standardized Error Responses

Every error response in this project is:

```json
{ "error": "human-readable reason" }
```

with the matching HTTP status set on the response (400 validation, 401 unauthenticated, 403
unauthorized, 404 not found, 409 conflict, 413 payload too large, 415 unsupported media type, 429
rate-limited). There is no `success`/`fields` envelope — one flat `error` string is enough for every
consumer this API has (the same-origin browser client and tests), and keeping every error the same
shape means a caller only has to check one field. Private responses also set
`Cache-Control: private, no-store` (or `no-store` for rejections) so nothing sensitive is cached at
the edge.
