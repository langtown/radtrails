import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import {
  MAX_REVIEW_NOTE_CHARACTERS,
  handleListPendingProfiles,
  handleReviewProfile,
  reviewProfile,
} from "@/lib/profile-review";
import { SESSION_COOKIE_NAME, createSession } from "@/lib/session";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, display_name) VALUES (?, ?) RETURNING id",
  )
    .bind(googleSub, googleSub)
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

async function createAdmin(sub = "review-admin"): Promise<number> {
  const userId = await createUser(sub);
  await grant(userId, "admin");
  return userId;
}

async function createProfile(
  userId: number,
  {
    name = "Pending Rider",
    status = "pending",
    socials = {},
  }: { name?: string; status?: string; socials?: Record<string, string> } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO profiles
       (user_id, slug, display_name, bio, social_links, status, submitted_at)
     VALUES (?, ?, ?, 'A rider bio', ?, ?, CURRENT_TIMESTAMP)`,
  )
    .bind(
      userId,
      `${name.toLowerCase().replaceAll(" ", "-")}-${userId}`,
      name,
      JSON.stringify(socials),
      status,
    )
    .run();
}

async function requestForUser(
  userId: number,
  url = "https://radtrails.org/api/admin/profiles",
  init: RequestInit = {},
): Promise<Request> {
  const { token } = await createSession(env.DB, userId);
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${SESSION_COOKIE_NAME}=${token}`);
  return new Request(url, { ...init, headers });
}

async function reviewRequest(
  actorId: number,
  profileId: number,
  body: unknown,
): Promise<Response> {
  return handleReviewProfile(
    env.DB,
    await requestForUser(
      actorId,
      `https://radtrails.org/api/admin/profiles/${profileId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    profileId,
  );
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("the pending queue requires an authenticated admin", async () => {
  const unsigned = await handleListPendingProfiles(
    env.DB,
    new Request("https://radtrails.org/api/admin/profiles"),
  );
  const member = await createUser("review-member");
  await grant(member, "member");
  const forbidden = await handleListPendingProfiles(
    env.DB,
    await requestForUser(member),
  );

  expect(unsigned.status).toBe(401);
  expect(forbidden.status).toBe(403);
});

test("the queue returns pending profile content, personas, images, and socials only", async () => {
  const admin = await createAdmin();
  const pending = await createUser("pending-subject");
  const approved = await createUser("approved-subject");
  await grant(pending, "member");
  await grant(pending, "coach");
  await createProfile(pending, {
    socials: { instagram: "https://instagram.com/pending" },
  });
  await createProfile(approved, { name: "Approved Rider", status: "approved" });

  const response = await handleListPendingProfiles(
    env.DB,
    await requestForUser(admin),
  );
  const body = await response.json<{
    profiles: Array<Record<string, unknown>>;
  }>();

  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(body.profiles).toHaveLength(1);
  expect(body.profiles[0]).toMatchObject({
    userId: pending,
    displayName: "Pending Rider",
    bio: "A rider bio",
    imageUrl: null,
    personas: ["coach", "member"],
    socials: { instagram: "https://instagram.com/pending" },
  });
  expect(JSON.stringify(body)).not.toContain("pending-subject");
});

test("an admin can approve a pending profile and records the reviewer", async () => {
  const admin = await createAdmin();
  const rider = await createUser("approve-rider");
  await createProfile(rider);

  const response = await reviewRequest(admin, rider, { action: "approve" });
  const row = await env.DB.prepare(
    "SELECT status, reviewed_by, reviewed_at, review_note FROM profiles WHERE user_id = ?",
  )
    .bind(rider)
    .first<{
      status: string;
      reviewed_by: number;
      reviewed_at: string | null;
      review_note: string | null;
    }>();

  expect(response.status).toBe(200);
  expect(row).toMatchObject({
    status: "approved",
    reviewed_by: admin,
    review_note: null,
  });
  expect(row?.reviewed_at).not.toBeNull();
});

test("a successful approval runs public-cache invalidation after publishing", async () => {
  const admin = await createAdmin();
  const rider = await createUser("approve-and-invalidate");
  await createProfile(rider);
  const decisions: Array<{ action: string; profileUserId: number }> = [];

  const response = await handleReviewProfile(
    env.DB,
    await requestForUser(
      admin,
      `https://radtrails.org/api/admin/profiles/${rider}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      },
    ),
    rider,
    async (decision) => {
      const published = await env.DB.prepare(
        "SELECT display_name FROM published_profiles WHERE user_id = ?",
      )
        .bind(rider)
        .first<{ display_name: string }>();
      expect(published?.display_name).toBe("Pending Rider");
      decisions.push(decision);
    },
  );

  expect(response.status).toBe(200);
  expect(decisions).toEqual([{ action: "approve", profileUserId: rider }]);
});

test("rejection requires safe feedback and leaves the profile editable", async () => {
  const admin = await createAdmin();
  const rider = await createUser("reject-rider");
  await createProfile(rider);

  expect((await reviewRequest(admin, rider, { action: "reject" })).status).toBe(
    400,
  );
  const response = await reviewRequest(admin, rider, {
    action: "reject",
    note: "Please use a clearer headshot.",
  });
  const row = await env.DB.prepare(
    "SELECT status, review_note FROM profiles WHERE user_id = ?",
  )
    .bind(rider)
    .first<{ status: string; review_note: string }>();

  expect(response.status).toBe(200);
  expect(row).toEqual({
    status: "rejected",
    review_note: "Please use a clearer headshot.",
  });
});

test("a non-admin cannot review a profile even through the business function", async () => {
  const member = await createUser("review-bystander");
  const rider = await createUser("review-target");
  await createProfile(rider);

  await expect(
    reviewProfile(env.DB, {
      actorId: member,
      profileUserId: rider,
      action: "approve",
      note: null,
    }),
  ).rejects.toMatchObject({ status: 403 });
});

test("review updates only the selected pending profile and cannot be replayed", async () => {
  const admin = await createAdmin();
  const first = await createUser("review-first");
  const second = await createUser("review-second");
  await createProfile(first);
  await createProfile(second, { name: "Second Rider" });

  expect((await reviewRequest(admin, first, { action: "approve" })).status).toBe(
    200,
  );
  expect((await reviewRequest(admin, first, { action: "reject", note: "No" })).status).toBe(
    409,
  );
  const secondStatus = await env.DB.prepare(
    "SELECT status FROM profiles WHERE user_id = ?",
  )
    .bind(second)
    .first<{ status: string }>();
  expect(secondStatus?.status).toBe("pending");
});

test("review bodies reject unknown actions, fields, markup, and long notes", async () => {
  const admin = await createAdmin();
  const rider = await createUser("invalid-review");
  await createProfile(rider);

  const invalid = [
    { action: "publish" },
    { action: "approve", userId: rider },
    { action: "reject", note: "<b>No</b>" },
    { action: "reject", note: "x".repeat(MAX_REVIEW_NOTE_CHARACTERS + 1) },
  ];
  for (const body of invalid) {
    expect((await reviewRequest(admin, rider, body)).status).toBe(400);
  }
});
