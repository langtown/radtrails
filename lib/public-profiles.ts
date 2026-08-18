import { PUBLIC_PROFILES_CACHE_TAG } from "./profile-cache";
import {
  parseStoredSocialLinks,
  type SocialLinks,
} from "./profiles";

export const PUBLIC_PROFILE_PERSONAS = [
  "theteam",
  "coach",
  "alumni",
] as const;

export const PUBLIC_PROFILE_CACHE_CONTROL =
	"public, max-age=0, s-maxage=300, must-revalidate";

export type PublicPersona = (typeof PUBLIC_PROFILE_PERSONAS)[number];

export type PublicProfile = {
  slug: string;
  name: string;
  image: string | null;
  bio: string | null;
  imagePosition: string | null;
  socials: SocialLinks;
};

type PublishedProfileRow = {
  slug: string;
  display_name: string;
  bio: string | null;
  image_key: string | null;
  image_position: string | null;
  social_links: string;
};

function isPublicPersona(value: string): value is PublicPersona {
  return (PUBLIC_PROFILE_PERSONAS as readonly string[]).includes(value);
}

function publicProfile(row: PublishedProfileRow): PublicProfile {
  return {
    slug: row.slug,
    name: row.display_name,
    image: row.image_key ? `/api/profiles/image/${row.image_key}` : null,
    bio: row.bio,
    imagePosition: row.image_position,
    socials: parseStoredSocialLinks(row.social_links),
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function cacheableJson(body: unknown, status = 200): Promise<Response> {
  const text = JSON.stringify(body);
  return new Response(text, {
    status,
    headers: {
      "Cache-Control": PUBLIC_PROFILE_CACHE_CONTROL,
      "Cache-Tag": PUBLIC_PROFILES_CACHE_TAG,
      "Content-Type": "application/json",
      ETag: `"${await sha256Hex(text)}"`,
    },
  });
}

function noStoreJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function cacheKey(origin: string, path: string): Request {
  return new Request(new URL(path, origin).toString(), { method: "GET" });
}

function etagMatches(request: Request, etag: string | null): boolean {
  if (!etag) return false;
  const candidates = request.headers.get("If-None-Match");
  if (!candidates) return false;

  return candidates.split(",").some((candidate) => {
    const normalized = candidate.trim();
    return normalized === "*" || normalized === etag || normalized === `W/${etag}`;
  });
}

function responseForRequest(
  request: Request,
  response: Response,
  cacheStatus: "HIT" | "MISS",
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Radtrails-Cache", cacheStatus);

  if (etagMatches(request, response.headers.get("ETag"))) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}

async function cachedOrLoad(
  request: Request,
  key: Request,
  cache: Cache | undefined,
  load: () => Promise<Response>,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response> {
  const cached = await cache?.match(key);
  if (cached) return responseForRequest(request, cached, "HIT");

  const fresh = await load();
  if (cache) {
    const put = cache.put(key, fresh.clone());
    if (waitUntil) waitUntil(put);
    else await put;
  }
  return responseForRequest(request, fresh, "MISS");
}

function listPersona(request: Request): PublicPersona | null {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => key !== "persona")) {
    return null;
  }

  const values = url.searchParams.getAll("persona");
  if (values.length > 1) return null;
  const persona = values[0] ?? "theteam";
  return isPublicPersona(persona) ? persona : null;
}

async function listPublicProfiles(
	db: D1Database,
	persona: PublicPersona,
): Promise<PublicProfile[]> {
	const { results } = await db
		.prepare(
			`SELECT pp.slug, pp.display_name, pp.bio, pp.image_key,
                pp.image_position, pp.social_links
         FROM published_profiles pp
         INNER JOIN user_personas up ON up.user_id = pp.user_id
         WHERE up.persona_key = ?
         ORDER BY pp.display_name, pp.slug`,
		)
		.bind(persona)
		.all<PublishedProfileRow>();

	return results.map(publicProfile);
}

async function cachedPublicProfileListResponse(
	db: D1Database,
	request: Request,
	persona: PublicPersona,
	cache?: Cache,
	waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response> {
	const origin = new URL(request.url).origin;
	const key = cacheKey(origin, `/api/profiles?persona=${persona}`);
	return cachedOrLoad(
		request,
		key,
		cache,
		async () => cacheableJson({ profiles: await listPublicProfiles(db, persona) }),
		waitUntil,
	);
}

/**
 * Reads a public persona list through the same edge cache as the public API.
 * Server pages use this directly, avoiding a public HTTP subrequest.
 */
export async function getCachedPublicProfiles(
	db: D1Database,
	originOrUrl: string,
	persona: PublicPersona,
	cache?: Cache,
	waitUntil?: (promise: Promise<unknown>) => void,
): Promise<PublicProfile[]> {
	const origin = new URL(originOrUrl).origin;
	const request = cacheKey(origin, `/api/profiles?persona=${persona}`);
	const response = await cachedPublicProfileListResponse(
		db,
		request,
		persona,
		cache,
		waitUntil,
	);
	const body = (await response.json()) as { profiles: PublicProfile[] };
	return body.profiles;
}

/** Public GET /api/profiles, filtered by one explicitly public persona. */
export async function handleListPublicProfiles(
  db: D1Database,
  request: Request,
  cache?: Cache,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response> {
  const persona = listPersona(request);
  if (!persona) {
    return noStoreJson({ error: "unknown public persona" }, 400);
  }

	return cachedPublicProfileListResponse(
		db,
		request,
		persona,
		cache,
		waitUntil,
	);
}

function validSlug(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= 80 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

/** Public GET /api/profiles/:slug, gated by any public persona. */
export async function handleGetPublicProfile(
  db: D1Database,
  request: Request,
  slug: string,
  cache?: Cache,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response> {
  if (!validSlug(slug)) {
    return noStoreJson({ error: "profile not found" }, 404);
  }

  const origin = new URL(request.url).origin;
  const key = cacheKey(origin, `/api/profiles/${slug}`);
  return cachedOrLoad(request, key, cache, async () => {
    const row = await db
      .prepare(
        `SELECT pp.slug, pp.display_name, pp.bio, pp.image_key,
                pp.image_position, pp.social_links
         FROM published_profiles pp
         WHERE pp.slug = ?
           AND EXISTS (
             SELECT 1
             FROM user_personas up
             INNER JOIN personas persona ON persona.key = up.persona_key
             WHERE up.user_id = pp.user_id AND persona.is_public = 1
           )`,
      )
      .bind(slug)
      .first<PublishedProfileRow>();

    return row
      ? cacheableJson({ profile: publicProfile(row) })
      : cacheableJson({ error: "profile not found" }, 404);
  }, waitUntil);
}

/** The runtime Cache API is absent under plain `next dev`, so caching is optional. */
export function getDefaultWorkerCache(): Cache | undefined {
  const storage = (
    globalThis as typeof globalThis & {
      caches?: CacheStorage & { default?: Cache };
    }
  ).caches;
  return storage?.default;
}

/** Purges every persona list and, when known, the profile's canonical URL. */
export async function invalidatePublicProfileCache(
	cache: Cache | undefined,
	originOrUrls: string | readonly string[],
	slug?: string | null,
): Promise<void> {
	if (!cache) return;
	const inputs = typeof originOrUrls === "string" ? [originOrUrls] : originOrUrls;
	const origins = new Set(inputs.map((value) => new URL(value).origin));
	const keys: Request[] = [];

	for (const origin of origins) {
		keys.push(
			...PUBLIC_PROFILE_PERSONAS.map((persona) =>
				cacheKey(origin, `/api/profiles?persona=${persona}`),
			),
		);
		if (slug && validSlug(slug)) {
			keys.push(cacheKey(origin, `/api/profiles/${slug}`));
		}
	}

	await Promise.all(keys.map((key) => cache.delete(key)));
}

export async function findProfileSlug(
  db: D1Database,
  userId: number,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT slug FROM profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ slug: string }>();
  return row?.slug ?? null;
}
