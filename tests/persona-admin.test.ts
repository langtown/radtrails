import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import {
  PersonaChangeError,
  applyPersonaChange,
  getAdminDashboardStats,
  hasAnyAdmin,
  listUsersWithPersonas,
  requireAdminUser,
} from "@/lib/persona-admin";
import { getUserPersonas, hasPersona } from "@/lib/personas";
import { SESSION_COOKIE_NAME, createSession } from "@/lib/session";

async function createUser(
  googleSub: string,
  email = `${googleSub}@example.com`,
): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, email, display_name) VALUES (?, ?, ?) RETURNING id",
  )
    .bind(googleSub, email, googleSub)
    .first<{ id: number }>();

  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function createAdmin(googleSub = "sub-admin"): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'admin')",
  )
    .bind(id)
    .run();
  return id;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("an admin can grant a persona", async () => {
  const admin = await createAdmin();
  const rider = await createUser("sub-rider");

  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: rider,
    persona: "theteam",
    action: "grant",
  });

  expect(await hasPersona(env.DB, rider, "theteam")).toBe(true);
});

test("the admin dashboard returns protected summary counts", async () => {
  const admin = await createAdmin();
  const rider = await createUser("dashboard-rider");
  await env.DB.prepare(
    `INSERT INTO profiles
       (user_id, slug, display_name, status, submitted_at)
     VALUES (?, 'dashboard-rider', 'Dashboard Rider', 'pending', CURRENT_TIMESTAMP)`,
  )
    .bind(rider)
    .run();

  await expect(getAdminDashboardStats(env.DB, rider)).rejects.toMatchObject({
    status: 403,
  });
  await expect(getAdminDashboardStats(env.DB, admin)).resolves.toEqual({
    users: 2,
    pendingProfiles: 1,
    publishedProfiles: 0,
  });
  expect(await hasAnyAdmin(env.DB)).toBe(true);
});

test("an admin can revoke a persona", async () => {
  const admin = await createAdmin();
  const rider = await createUser("sub-rider");
  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: rider,
    persona: "theteam",
    action: "grant",
  });

  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: rider,
    persona: "theteam",
    action: "revoke",
  });

  expect(await hasPersona(env.DB, rider, "theteam")).toBe(false);
});

test("a non-admin cannot change anyone's personas", async () => {
  const bystander = await createUser("sub-bystander");
  const rider = await createUser("sub-rider");

  await expect(
    applyPersonaChange(env.DB, {
      actorId: bystander,
      userId: rider,
      persona: "theteam",
      action: "grant",
    }),
  ).rejects.toBeInstanceOf(PersonaChangeError);

  expect(await hasPersona(env.DB, rider, "theteam")).toBe(false);
});

test("the only admin cannot revoke their own admin persona", async () => {
  const admin = await createAdmin();

  await expect(
    applyPersonaChange(env.DB, {
      actorId: admin,
      userId: admin,
      persona: "admin",
      action: "revoke",
    }),
  ).rejects.toBeInstanceOf(PersonaChangeError);

  expect(await hasPersona(env.DB, admin, "admin")).toBe(true);
});

test("an admin can step down once another admin exists", async () => {
  const first = await createAdmin("sub-admin-one");
  const second = await createAdmin("sub-admin-two");

  await applyPersonaChange(env.DB, {
    actorId: first,
    userId: first,
    persona: "admin",
    action: "revoke",
  });

  expect(await hasPersona(env.DB, first, "admin")).toBe(false);
  expect(await hasPersona(env.DB, second, "admin")).toBe(true);
});

test("one admin cannot demote the last remaining admin either", async () => {
  const admin = await createAdmin("sub-admin-one");
  const second = await createAdmin("sub-admin-two");
  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: second,
    persona: "admin",
    action: "revoke",
  });

  await expect(
    applyPersonaChange(env.DB, {
      actorId: admin,
      userId: admin,
      persona: "admin",
      action: "revoke",
    }),
  ).rejects.toBeInstanceOf(PersonaChangeError);
});

test("an unknown persona is rejected rather than written", async () => {
  const admin = await createAdmin();
  const rider = await createUser("sub-rider");

  await expect(
    applyPersonaChange(env.DB, {
      actorId: admin,
      userId: rider,
      persona: "superuser" as never,
      action: "grant",
    }),
  ).rejects.toBeInstanceOf(PersonaChangeError);
});

test("changing a persona records which admin did it and when", async () => {
  const admin = await createAdmin();
  const rider = await createUser("sub-rider");

  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: rider,
    persona: "coach",
    action: "grant",
  });

  const row = await env.DB.prepare(
    "SELECT granted_by, granted_at FROM user_personas WHERE user_id = ? AND persona_key = 'coach'",
  )
    .bind(rider)
    .first<{ granted_by: number; granted_at: string }>();

  expect(row!.granted_by).toBe(admin);
  expect(row!.granted_at).not.toBeNull();
});

test("revoking a public persona leaves the rest of the account intact", async () => {
  const admin = await createAdmin();
  const rider = await createUser("sub-rider");
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'member')",
  )
    .bind(rider)
    .run();
  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: rider,
    persona: "theteam",
    action: "grant",
  });

  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: rider,
    persona: "theteam",
    action: "revoke",
  });

  expect(await getUserPersonas(env.DB, rider)).toEqual(["member"]);
});

test("listing shows every account with the personas it holds", async () => {
  const admin = await createAdmin();
  const rider = await createUser("sub-rider");
  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: rider,
    persona: "theteam",
    action: "grant",
  });
  await applyPersonaChange(env.DB, {
    actorId: admin,
    userId: rider,
    persona: "coach",
    action: "grant",
  });

  const users = await listUsersWithPersonas(env.DB);

  const listed = users.find((u) => u.id === rider);
  expect(listed?.personas).toEqual(["coach", "theteam"]);
  expect(users.find((u) => u.id === admin)?.personas).toEqual(["admin"]);
});

async function requestForUser(userId: number): Promise<Request> {
  const { token } = await createSession(env.DB, userId);
  return new Request("https://radtrails.org/api/admin/users", {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

test("an unauthenticated request is refused with 401, not 403", async () => {
  const request = new Request("https://radtrails.org/api/admin/users");

  await expect(requireAdminUser(env.DB, request)).rejects.toMatchObject({
    status: 401,
  });
});

test("a signed-in non-admin is refused with 403", async () => {
  const bystander = await createUser("sub-bystander");

  await expect(
    requireAdminUser(env.DB, await requestForUser(bystander)),
  ).rejects.toMatchObject({ status: 403 });
});

test("a signed-in admin is admitted and identified", async () => {
  const admin = await createAdmin();

  await expect(
    requireAdminUser(env.DB, await requestForUser(admin)),
  ).resolves.toBe(admin);
});

test("listing never exposes a user's google_sub", async () => {
  await createAdmin();

  const users = await listUsersWithPersonas(env.DB);

  expect(users.length).toBeGreaterThan(0);
  for (const user of users) {
    expect(Object.keys(user)).not.toContain("google_sub");
  }
});
