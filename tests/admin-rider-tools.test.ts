import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import {
  handleAdminGetPlaylist,
  handleAdminPutPlaylist,
  getPlaylist,
} from "@/lib/athlete-playlist";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { handleGetUserSessions } from "@/lib/session-occurrences";
import { createWeeklyAssignment } from "@/lib/weekly-assignments";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, display_name) VALUES (?, ?) RETURNING id",
  )
    .bind(googleSub, googleSub)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function createAdmin(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'admin')",
  )
    .bind(id)
    .run();
  return id;
}

async function createCoach(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'coach')",
  )
    .bind(id)
    .run();
  return id;
}

async function createRider(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await grantDefaultPersona(env.DB, id);
  await grantPersona(env.DB, {
    userId: id,
    persona: "theteam",
    grantedBy: await createAdmin(`${googleSub}-granter`),
  });
  return id;
}

async function requestForUser(userId: number): Promise<Request> {
  const { token } = await createSession(env.DB, userId);
  return new Request("https://radtrails.org/api/admin/users/1/x", {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("an admin can read a rider's interval schedule", async () => {
  const admin = await createAdmin("sub-admin");
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  const response = await handleGetUserSessions(
    env.DB,
    await requestForUser(admin),
    rider,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { sessions: { riderId: number }[] };
  expect(body.sessions.length).toBeGreaterThan(0);
  expect(body.sessions[0].riderId).toBe(rider);
});

test("a non-admin cannot read another user's schedule", async () => {
  const bystander = await createRider("sub-bystander");
  const rider = await createRider("sub-rider");

  const response = await handleGetUserSessions(
    env.DB,
    await requestForUser(bystander),
    rider,
  );
  expect(response.status).toBe(403);
});

test("an admin can set and read a rider's playlist", async () => {
  const admin = await createAdmin("sub-admin");
  const rider = await createRider("sub-rider");

  const putResponse = await handleAdminPutPlaylist(
    env.DB,
    new Request("https://radtrails.org/api/admin/users/1/playlist", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE_NAME}=${(await createSession(env.DB, admin)).token}`,
      },
      body: JSON.stringify({ playlistUrl: "https://open.spotify.com/playlist/xyz" }),
    }),
    rider,
  );
  expect(putResponse.status).toBe(200);

  const getResponse = await handleAdminGetPlaylist(
    env.DB,
    await requestForUser(admin),
    rider,
  );
  expect(getResponse.status).toBe(200);
  expect(await getResponse.json()).toEqual({
    playlistUrl: "https://open.spotify.com/playlist/xyz",
  });
  // And the rider's own read path sees the same value.
  expect(await getPlaylist(env.DB, rider)).toEqual({
    playlistUrl: "https://open.spotify.com/playlist/xyz",
  });
});

test("a non-admin cannot set another user's playlist", async () => {
  const bystander = await createRider("sub-bystander");
  const rider = await createRider("sub-rider");

  const response = await handleAdminPutPlaylist(
    env.DB,
    new Request("https://radtrails.org/api/admin/users/1/playlist", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE_NAME}=${(await createSession(env.DB, bystander)).token}`,
      },
      body: JSON.stringify({ playlistUrl: "https://open.spotify.com/playlist/xyz" }),
    }),
    rider,
  );
  expect(response.status).toBe(403);
  expect(await getPlaylist(env.DB, rider)).toEqual({ playlistUrl: null });
});
