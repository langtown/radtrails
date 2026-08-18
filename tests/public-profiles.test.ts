import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import { applyPersonaChange } from "@/lib/persona-admin";
import {
  PUBLIC_PROFILE_CACHE_CONTROL,
  getCachedPublicProfiles,
  handleGetPublicProfile,
  handleListPublicProfiles,
  invalidatePublicProfileCache,
} from "@/lib/public-profiles";
import { reviewProfile } from "@/lib/profile-review";

class MemoryCache {
  readonly entries = new Map<string, Response>();
  matches = 0;
  puts = 0;
  deletes = 0;

  private key(request: RequestInfo | URL): string {
    if (request instanceof Request) return request.url;
    return String(request);
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    this.matches += 1;
    return this.entries.get(this.key(request))?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.puts += 1;
    this.entries.set(this.key(request), response.clone());
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    this.deletes += 1;
    return this.entries.delete(this.key(request));
  }

  asCache(): Cache {
    return this as unknown as Cache;
  }
}

async function createUser(sub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, email, display_name) VALUES (?, ?, ?) RETURNING id",
  )
    .bind(sub, `${sub}@example.com`, sub)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function grant(userId: number, persona: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, ?)",
  )
    .bind(userId, persona)
    .run();
}

async function createAdmin(): Promise<number> {
  const admin = await createUser("public-admin");
  await grant(admin, "admin");
  return admin;
}

async function submitProfile(
  userId: number,
  name: string,
  socials: Record<string, string> = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO profiles
       (user_id, slug, display_name, bio, image_position, social_links,
        status, submitted_at)
     VALUES (?, ?, ?, ?, 'center 37%', ?, 'pending', CURRENT_TIMESTAMP)`,
  )
    .bind(
      userId,
      name.toLowerCase().replaceAll(" ", "-"),
      name,
      `${name} bio`,
      JSON.stringify(socials),
    )
    .run();
}

async function approve(admin: number, userId: number): Promise<void> {
  await reviewProfile(env.DB, {
    actorId: admin,
    profileUserId: userId,
    action: "approve",
    note: null,
  });
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("list reads require approval and the requested public persona", async () => {
  const admin = await createAdmin();
  const team = await createUser("public-team");
  const coach = await createUser("public-coach");
  const pending = await createUser("public-pending");
  const member = await createUser("public-member");

  await grant(team, "theteam");
  await grant(coach, "coach");
  await grant(pending, "theteam");
  await grant(member, "member");
  await submitProfile(team, "Team Rider", {
    instagram: "https://instagram.com/teamrider",
  });
  await submitProfile(coach, "Trail Coach");
  await submitProfile(pending, "Pending Rider");
  await submitProfile(member, "Private Member");
  await approve(admin, team);
  await approve(admin, coach);
  await approve(admin, member);

  const teamResponse = await handleListPublicProfiles(
    env.DB,
    new Request("https://radtrails.org/api/profiles"),
  );
  const coachResponse = await handleListPublicProfiles(
    env.DB,
    new Request("https://radtrails.org/api/profiles?persona=coach"),
  );

  await expect(teamResponse.json()).resolves.toEqual({
    profiles: [
      {
        slug: "team-rider",
        name: "Team Rider",
        image: null,
        bio: "Team Rider bio",
        imagePosition: "center 37%",
        socials: { instagram: "https://instagram.com/teamrider" },
        sponsors: [],
      },
    ],
  });
  const coachBody = await coachResponse.json();
  expect(coachBody).toMatchObject({
    profiles: [{ slug: "trail-coach", name: "Trail Coach" }],
  });
  expect(teamResponse.headers.get("Cache-Control")).toBe(
    PUBLIC_PROFILE_CACHE_CONTROL,
  );
  expect(JSON.stringify(coachBody)).not.toContain("public-coach");
});

test("single reads expose only approved profiles with a public persona", async () => {
  const admin = await createAdmin();
  const alumni = await createUser("public-alumni");
  const member = await createUser("single-member");
  await grant(alumni, "alumni");
  await grant(member, "member");
  await submitProfile(alumni, "Former Rider");
  await submitProfile(member, "Member Profile");
  await approve(admin, alumni);
  await approve(admin, member);

  const visible = await handleGetPublicProfile(
    env.DB,
    new Request("https://radtrails.org/api/profiles/former-rider"),
    "former-rider",
  );
  const hidden = await handleGetPublicProfile(
    env.DB,
    new Request("https://radtrails.org/api/profiles/member-profile"),
    "member-profile",
  );

  expect(visible.status).toBe(200);
  await expect(visible.json()).resolves.toMatchObject({
    profile: { slug: "former-rider", name: "Former Rider" },
  });
  expect(hidden.status).toBe(404);
});

test("cache hits avoid D1 and matching If-None-Match returns 304", async () => {
  const admin = await createAdmin();
  const rider = await createUser("cached-rider");
  await grant(rider, "theteam");
  await submitProfile(rider, "Cached Rider");
  await approve(admin, rider);
  const cache = new MemoryCache();
  const url = "https://radtrails.org/api/profiles?persona=theteam";

  const first = await handleListPublicProfiles(
    env.DB,
    new Request(url),
    cache.asCache(),
  );
  const etag = first.headers.get("ETag");
  const bomb = {
    prepare() {
      throw new Error("D1 must not be read on a cache hit");
    },
  } as unknown as D1Database;
  const second = await handleListPublicProfiles(
    bomb,
    new Request(url),
    cache.asCache(),
  );
  const conditional = await handleListPublicProfiles(
    bomb,
    new Request(url, { headers: { "If-None-Match": etag! } }),
    cache.asCache(),
  );
  const serverPageProfiles = await getCachedPublicProfiles(
    bomb,
    "https://radtrails.org/racing",
    "theteam",
    cache.asCache(),
  );

  expect(first.headers.get("X-Radtrails-Cache")).toBe("MISS");
  expect(second.headers.get("X-Radtrails-Cache")).toBe("HIT");
  expect(await second.text()).toBe(await first.text());
  expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
  expect(conditional.status).toBe(304);
  expect(conditional.headers.get("ETag")).toBe(etag);
  expect(serverPageProfiles).toMatchObject([{ name: "Cached Rider" }]);
  expect(cache.puts).toBe(1);
});

test("edits keep the last approved snapshot public until the next approval", async () => {
  const admin = await createAdmin();
  const rider = await createUser("snapshot-rider");
  await grant(rider, "theteam");
  await submitProfile(rider, "Original Rider");
  await approve(admin, rider);

  await env.DB.prepare(
    `UPDATE profiles
     SET display_name = 'Unapproved Change', bio = 'New draft', status = 'pending'
     WHERE user_id = ?`,
  )
    .bind(rider)
    .run();

  const beforeApproval = await handleListPublicProfiles(
    env.DB,
    new Request("https://radtrails.org/api/profiles?persona=theteam"),
  );
  await expect(beforeApproval.json()).resolves.toMatchObject({
    profiles: [{ name: "Original Rider", bio: "Original Rider bio" }],
  });

  await approve(admin, rider);
  const afterApproval = await handleListPublicProfiles(
    env.DB,
    new Request("https://radtrails.org/api/profiles?persona=theteam"),
  );
  await expect(afterApproval.json()).resolves.toMatchObject({
    profiles: [{ name: "Unapproved Change", bio: "New draft" }],
  });
});

test("explicit invalidation removes list and slug cache entries", async () => {
  const cache = new MemoryCache();
  const cacheApi = cache.asCache();
  const origins = [
    "https://radtrails.org",
    "https://preview-radtrails.langtown.workers.dev",
  ];
  for (const origin of origins) {
    for (const url of [
      `${origin}/api/profiles?persona=theteam`,
      `${origin}/api/profiles?persona=coach`,
      `${origin}/api/profiles?persona=alumni`,
      `${origin}/api/profiles/cached-rider`,
    ]) {
      await cacheApi.put(new Request(url), new Response("cached"));
    }
  }

  await invalidatePublicProfileCache(cacheApi, origins, "cached-rider");

  expect(cache.entries.size).toBe(0);
  expect(cache.deletes).toBe(8);
});

test("public persona grants and revocations invalidate visibility immediately", async () => {
  const admin = await createAdmin();
  const rider = await createUser("persona-cache-rider");
  await submitProfile(rider, "Persona Rider");
  await approve(admin, rider);
  const cache = new MemoryCache();
  const request = new Request(
    "https://radtrails.org/api/profiles?persona=theteam",
  );
  const invalidate = async () => {
    await invalidatePublicProfileCache(
      cache.asCache(),
      "https://radtrails.org",
      "persona-rider",
    );
  };

  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: rider,
    persona: "theteam",
    action: "grant",
    onPublicVisibilityChanged: invalidate,
  });
  const granted = await handleListPublicProfiles(
    env.DB,
    request,
    cache.asCache(),
  );
  await expect(granted.json()).resolves.toMatchObject({
    profiles: [{ name: "Persona Rider" }],
  });

  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: rider,
    persona: "theteam",
    action: "revoke",
    onPublicVisibilityChanged: invalidate,
  });
  const revoked = await handleListPublicProfiles(
    env.DB,
    request,
    cache.asCache(),
  );
  await expect(revoked.json()).resolves.toEqual({ profiles: [] });
});

test("invalid persona filters and slugs are rejected without touching D1", async () => {
  const bomb = {
    prepare() {
      throw new Error("invalid public requests must not touch D1");
    },
  } as unknown as D1Database;

  const persona = await handleListPublicProfiles(
    bomb,
    new Request("https://radtrails.org/api/profiles?persona=admin"),
  );
  const slug = await handleGetPublicProfile(
    bomb,
    new Request("https://radtrails.org/api/profiles/INVALID"),
    "INVALID",
  );

  expect(persona.status).toBe(400);
  expect(slug.status).toBe(404);
  expect(persona.headers.get("Cache-Control")).toBe("no-store");
});
