import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import {
  MAX_PROFILE_BIO_CHARACTERS,
  MAX_PROFILE_NAME_CHARACTERS,
  MAX_PROFILE_REQUEST_BYTES,
  handleGetProfile,
  handlePutProfile,
} from "@/lib/profiles";
import { SESSION_COOKIE_NAME, createSession } from "@/lib/session";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub) VALUES (?) RETURNING id",
  )
    .bind(googleSub)
    .first<{ id: number }>();

  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function requestForUser(
  userId: number,
  init: RequestInit = {},
): Promise<Request> {
  const { token } = await createSession(env.DB, userId);
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${SESSION_COOKIE_NAME}=${token}`);

  return new Request("https://radtrails.org/api/profile", {
    ...init,
    headers,
  });
}

async function putProfile(
  userId: number,
  body: unknown,
): Promise<Response> {
  return handlePutProfile(
    env.DB,
    await requestForUser(userId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function addPendingImage(userId: number, imageKey: string): Promise<void> {
  const bytes = Uint8Array.from([1, 2, 3]);
  await env.DB.prepare(
    "INSERT INTO profile_images (image_key, content_type, byte_size, bytes) VALUES (?, ?, ?, ?)",
  )
    .bind(imageKey, "image/png", bytes.byteLength, bytes)
    .run();
  await env.DB.prepare(
    "INSERT INTO profile_image_uploads (user_id, image_key) VALUES (?, ?)",
  )
    .bind(userId, imageKey)
    .run();
}

async function grantPersona(
  userId: number,
  persona: "member" | "theteam" | "coach" | "alumni" | "admin",
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, ?)",
  )
    .bind(userId, persona)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
  await env.DB.prepare("DELETE FROM profile_image_uploads").run();
  await env.DB.prepare("DELETE FROM profile_images").run();
});

test("GET and PUT require authentication", async () => {
  const get = await handleGetProfile(
    env.DB,
    new Request("https://radtrails.org/api/profile"),
  );
  const put = await handlePutProfile(
    env.DB,
    new Request("https://radtrails.org/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Unsigned" }),
    }),
  );

  expect(get.status).toBe(401);
  expect(put.status).toBe(401);
});

test("a user creates a pending profile and reads their own draft", async () => {
  const userId = await createUser("sub-profile-create");

  const saved = await putProfile(userId, {
    displayName: "  Trail Rider  ",
    bio: "  Loves technical trails.  ",
    imagePosition: "center 32%",
  });
  expect(saved.status).toBe(201);
  expect(await saved.json()).toMatchObject({
    profile: {
      slug: "trail-rider",
      displayName: "Trail Rider",
      bio: "Loves technical trails.",
      imageKey: null,
      imagePosition: "center 32%",
      socials: {},
      status: "pending",
    },
  });

  const read = await handleGetProfile(
    env.DB,
    await requestForUser(userId),
  );
  expect(read.status).toBe(200);
  expect(await read.json()).toMatchObject({
    profile: { slug: "trail-rider", status: "pending" },
  });
});

test("GET returns null when the signed-in user has no profile", async () => {
  const userId = await createUser("sub-no-profile");

  const response = await handleGetProfile(
    env.DB,
    await requestForUser(userId),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ profile: null });
});

test("two users with the same display name receive unique slugs", async () => {
  const first = await createUser("sub-slug-one");
  const second = await createUser("sub-slug-two");

  const firstProfile = await (
    await putProfile(first, { displayName: "Same Rider" })
  ).json<{ profile: { slug: string } }>();
  const secondProfile = await (
    await putProfile(second, { displayName: "Same Rider" })
  ).json<{ profile: { slug: string } }>();

  expect(firstProfile.profile.slug).toBe("same-rider");
  expect(secondProfile.profile.slug).toBe("same-rider-2");
});

test("edits preserve the slug and return an approved row to pending", async () => {
  const userId = await createUser("sub-profile-edit");
  await putProfile(userId, { displayName: "Original Name", bio: "Old bio" });
  await env.DB.prepare(
    "UPDATE profiles SET status = 'approved', reviewed_at = ?, reviewed_by = ? WHERE user_id = ?",
  )
    .bind(new Date().toISOString(), userId, userId)
    .run();

  const response = await putProfile(userId, {
    displayName: "Changed Name",
    bio: "New bio",
  });
  const body = await response.json<{
    profile: { slug: string; status: string; reviewedAt: string | null };
  }>();

  expect(response.status).toBe(200);
  expect(body.profile.slug).toBe("original-name");
  expect(body.profile.status).toBe("pending");
  expect(body.profile.reviewedAt).toBeNull();
});

test("the owner can read rejection feedback and resubmitting clears it", async () => {
  const userId = await createUser("sub-profile-feedback");
  await putProfile(userId, { displayName: "Feedback Rider" });
  await env.DB.prepare(
    "UPDATE profiles SET status = 'rejected', review_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE user_id = ?",
  )
    .bind("Please add more detail to your bio.", userId)
    .run();

  const rejected = await handleGetProfile(
    env.DB,
    await requestForUser(userId),
  );
  await expect(rejected.json()).resolves.toMatchObject({
    profile: {
      status: "rejected",
      reviewNote: "Please add more detail to your bio.",
    },
  });

  const resubmitted = await putProfile(userId, {
    displayName: "Feedback Rider",
    bio: "A more detailed bio.",
  });
  await expect(resubmitted.json()).resolves.toMatchObject({
    profile: { status: "pending", reviewNote: null },
  });
});

test("one user never reads or overwrites another user's profile", async () => {
  const first = await createUser("sub-isolation-one");
  const second = await createUser("sub-isolation-two");
  await putProfile(first, { displayName: "First Rider", bio: "First" });
  await putProfile(second, { displayName: "Second Rider", bio: "Second" });

  await putProfile(first, { displayName: "First Updated", bio: "Changed" });

  const secondRead = await handleGetProfile(
    env.DB,
    await requestForUser(second),
  );
  expect(await secondRead.json()).toMatchObject({
    profile: { displayName: "Second Rider", bio: "Second" },
  });
});

test("client-supplied identity and unknown fields are rejected", async () => {
  const first = await createUser("sub-profile-identity-one");
  const second = await createUser("sub-profile-identity-two");

  const response = await putProfile(first, {
    userId: second,
    displayName: "Impersonation",
  });

  expect(response.status).toBe(400);
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM profiles",
  ).first<{ n: number }>();
  expect(count?.n).toBe(0);
});

test("member-only accounts may save profiles but may not add social links", async () => {
  const userId = await createUser("sub-member-socials");
  await grantPersona(userId, "member");

  const plainProfile = await putProfile(userId, {
    displayName: "Member Rider",
  });
  const withSocial = await putProfile(userId, {
    displayName: "Member Rider",
    socials: { instagram: "https://www.instagram.com/member-rider/" },
  });

  expect(plainProfile.status).toBe(201);
  expect(withSocial.status).toBe(403);
  await expect(withSocial.json()).resolves.toEqual({
    error: "a non-member persona is required to add social links",
  });

  const read = await handleGetProfile(
    env.DB,
    await requestForUser(userId),
  );
  await expect(read.json()).resolves.toMatchObject({
    profile: { displayName: "Member Rider", socials: {} },
  });
});

test("accounts with any non-member persona can save and read supported social links", async () => {
  const userId = await createUser("sub-coach-socials");
  await grantPersona(userId, "member");
  await grantPersona(userId, "coach");

  const socials = {
    instagram: "https://www.instagram.com/trail.coach/",
    tiktok: "https://www.tiktok.com/@trailcoach",
    twitter: "https://x.com/trailcoach",
    youtube: "https://www.youtube.com/@trailcoach",
    facebook: "https://www.facebook.com/trailcoach",
    strava: "https://www.strava.com/athletes/12345",
    website: "https://trailcoach.example/about",
  };
  const response = await putProfile(userId, {
    displayName: "Trail Coach",
    socials,
  });

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({
    profile: { socials },
  });

  const read = await handleGetProfile(
    env.DB,
    await requestForUser(userId),
  );
  await expect(read.json()).resolves.toMatchObject({
    profile: { socials },
  });
});

test("social fields reject unknown platforms, unsafe schemes, and spoofed hosts", async () => {
  const userId = await createUser("sub-invalid-socials");
  await grantPersona(userId, "alumni");
  const invalidSocials = [
    { linkedin: "https://www.linkedin.com/in/rider" },
    { instagram: "http://www.instagram.com/rider" },
    { instagram: "javascript:alert(1)" },
    { instagram: "https://instagram.com.evil.example/rider" },
    { twitter: "https://example.com/rider" },
    { website: "https://localhost/profile" },
    { website: "https://example.com/<script>" },
  ];

  for (const socials of invalidSocials) {
    const response = await putProfile(userId, {
      displayName: "Safe Rider",
      socials,
    });
    expect(response.status).toBe(400);
  }

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ n: number }>();
  expect(count?.n).toBe(0);
});

test("an eligible account can clear all social links", async () => {
  const userId = await createUser("sub-clear-socials");
  await grantPersona(userId, "theteam");
  await putProfile(userId, {
    displayName: "Team Rider",
    socials: { twitter: "https://twitter.com/teamrider" },
  });

  const response = await putProfile(userId, {
    displayName: "Team Rider",
    socials: {
      twitter: "",
      instagram: null,
    },
  });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    profile: { socials: {} },
  });
});

test("names and bios reject markup, control characters, and excessive length", async () => {
  const userId = await createUser("sub-profile-validation");
  const invalidBodies = [
    { displayName: "<b>Rider</b>" },
    { displayName: "Control\0Name" },
    { displayName: "n".repeat(MAX_PROFILE_NAME_CHARACTERS + 1) },
    { displayName: "Rider", bio: "<script>alert(1)</script>" },
    { displayName: "Rider", bio: "line\nbreak" },
    {
      displayName: "Rider",
      bio: "b".repeat(MAX_PROFILE_BIO_CHARACTERS + 1),
    },
  ];

  for (const body of invalidBodies) {
    expect((await putProfile(userId, body)).status).toBe(400);
  }
});

test("image position accepts racer-style values and rejects arbitrary CSS", async () => {
  const userId = await createUser("sub-image-position");

  expect(
    (
      await putProfile(userId, {
        displayName: "Positioned Rider",
        imagePosition: "center 44%",
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await putProfile(userId, {
        displayName: "Positioned Rider",
        imagePosition: "url(javascript:alert(1))",
      })
    ).status,
  ).toBe(400);
});

test("a user may attach only their own pending image key", async () => {
  const owner = await createUser("sub-image-owner");
  const other = await createUser("sub-image-other");
  const imageKey = "a".repeat(64);
  await addPendingImage(owner, imageKey);

  const refused = await putProfile(other, {
    displayName: "Other Rider",
    imageKey,
  });
  const accepted = await putProfile(owner, {
    displayName: "Image Owner",
    imageKey,
  });

  expect(refused.status).toBe(400);
  expect(accepted.status).toBe(201);
});

test("an already attached image remains valid after the pending slot changes", async () => {
  const userId = await createUser("sub-current-image");
  const currentKey = "b".repeat(64);
  const nextKey = "c".repeat(64);
  await addPendingImage(userId, currentKey);
  await putProfile(userId, { displayName: "Rider", imageKey: currentKey });

  await env.DB.prepare(
    "INSERT INTO profile_images (image_key, content_type, byte_size, bytes) VALUES (?, 'image/png', 1, ?)",
  )
    .bind(nextKey, Uint8Array.from([2]))
    .run();
  await env.DB.prepare(
    "UPDATE profile_image_uploads SET image_key = ? WHERE user_id = ?",
  )
    .bind(nextKey, userId)
    .run();

  const response = await putProfile(userId, {
    displayName: "Rider Updated",
    imageKey: currentKey,
  });
  expect(response.status).toBe(200);
});

test("malformed, non-JSON, and oversized bodies are rejected", async () => {
  const userId = await createUser("sub-profile-body");
  const malformed = await requestForUser(userId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{not-json",
  });
  const plain = await requestForUser(userId, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ displayName: "Rider" }),
  });
  const oversized = await requestForUser(userId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "Rider",
      bio: "x".repeat(MAX_PROFILE_REQUEST_BYTES),
    }),
  });

  expect((await handlePutProfile(env.DB, malformed)).status).toBe(400);
  expect((await handlePutProfile(env.DB, plain)).status).toBe(415);
  expect((await handlePutProfile(env.DB, oversized)).status).toBe(413);
});

test("self-read responses never expose internal user or reviewer ids", async () => {
  const userId = await createUser("immutable-profile-subject");
  await putProfile(userId, { displayName: "Private Identity" });

  const response = await handleGetProfile(
    env.DB,
    await requestForUser(userId),
  );
  const body = await response.json<Record<string, unknown>>();
  const serialized = JSON.stringify(body);

  expect(serialized).not.toContain("immutable-profile-subject");
  expect(serialized).not.toContain(`"userId":${userId}`);
  expect(serialized).not.toContain("reviewedBy");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
