import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";

import {
  DEFAULT_PERSONA,
  getUserPersonas,
  grantDefaultPersona,
  grantPersona,
  hasPersona,
  listUsersWithPersona,
  revokePersona,
} from "@/lib/personas";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub) VALUES (?) RETURNING id",
  )
    .bind(googleSub)
    .first<{ id: number }>();

  if (!row) throw new Error("failed to seed user");
  return row.id;
}

/** A user who already holds the admin persona, for use as a grantor. */
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

test("a brand-new account holds exactly the member persona", async () => {
  const userId = await createUser("sub-new");

  await grantDefaultPersona(env.DB, userId);

  expect(await getUserPersonas(env.DB, userId)).toEqual([DEFAULT_PERSONA]);
});

test("the default persona is not public, so a new account appears nowhere", async () => {
  const userId = await createUser("sub-invisible");
  await grantDefaultPersona(env.DB, userId);

  const publicPersonas = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM user_personas up JOIN personas p ON p.key = up.persona_key WHERE up.user_id = ? AND p.is_public = 1",
  )
    .bind(userId)
    .first<{ n: number }>();

  expect(publicPersonas!.n).toBe(0);
});

test("granting the default persona twice is harmless", async () => {
  const userId = await createUser("sub-twice");

  await grantDefaultPersona(env.DB, userId);
  await grantDefaultPersona(env.DB, userId);

  expect(await getUserPersonas(env.DB, userId)).toEqual([DEFAULT_PERSONA]);
});

test("an admin can grant a persona", async () => {
  const admin = await createAdmin();
  const userId = await createUser("sub-promoted");

  await grantPersona(env.DB, {
    userId,
    persona: "theteam",
    grantedBy: admin,
  });

  expect(await hasPersona(env.DB, userId, "theteam")).toBe(true);
});

test("an admin can grant the radfriends and private personas", async () => {
  const admin = await createAdmin();
  const userId = await createUser("sub-newpersonas");

  await grantPersona(env.DB, {
    userId,
    persona: "radfriends",
    grantedBy: admin,
  });
  await grantPersona(env.DB, {
    userId,
    persona: "private",
    grantedBy: admin,
  });

  expect(await hasPersona(env.DB, userId, "radfriends")).toBe(true);
  expect(await hasPersona(env.DB, userId, "private")).toBe(true);
});

test("a user cannot grant themselves a persona", async () => {
  const userId = await createUser("sub-selfpromote");
  await grantDefaultPersona(env.DB, userId);

  await expect(
    grantPersona(env.DB, {
      userId,
      persona: "admin",
      grantedBy: userId,
    }),
  ).rejects.toThrow(/admin/i);

  expect(await hasPersona(env.DB, userId, "admin")).toBe(false);
});

test("a non-admin cannot grant a persona to someone else", async () => {
  const bystander = await createUser("sub-bystander");
  await grantDefaultPersona(env.DB, bystander);
  const target = await createUser("sub-target");

  await expect(
    grantPersona(env.DB, {
      userId: target,
      persona: "coach",
      grantedBy: bystander,
    }),
  ).rejects.toThrow(/admin/i);
});

test("a grant records which admin made it", async () => {
  const admin = await createAdmin();
  const userId = await createUser("sub-audited");

  await grantPersona(env.DB, { userId, persona: "coach", grantedBy: admin });

  const row = await env.DB.prepare(
    "SELECT granted_by, granted_at FROM user_personas WHERE user_id = ? AND persona_key = 'coach'",
  )
    .bind(userId)
    .first<{ granted_by: number; granted_at: string }>();

  expect(row!.granted_by).toBe(admin);
  expect(row!.granted_at).not.toBeNull();
});

test("granting a persona the user already holds is harmless", async () => {
  const admin = await createAdmin();
  const userId = await createUser("sub-regrant");

  await grantPersona(env.DB, { userId, persona: "coach", grantedBy: admin });
  await grantPersona(env.DB, { userId, persona: "coach", grantedBy: admin });

  expect(await getUserPersonas(env.DB, userId)).toEqual(["coach"]);
});

test("revoking a persona removes only that persona", async () => {
  const admin = await createAdmin();
  const userId = await createUser("sub-revoked");
  await grantDefaultPersona(env.DB, userId);
  await grantPersona(env.DB, { userId, persona: "theteam", grantedBy: admin });

  await revokePersona(env.DB, userId, "theteam");

  expect(await getUserPersonas(env.DB, userId)).toEqual([DEFAULT_PERSONA]);
});

test("hasPersona is false for a persona the user was never granted", async () => {
  const userId = await createUser("sub-plain");
  await grantDefaultPersona(env.DB, userId);

  expect(await hasPersona(env.DB, userId, "admin")).toBe(false);
});

test("everyone holding a public persona can be listed for the site", async () => {
  const admin = await createAdmin();
  const rider = await createUser("sub-rider");
  const other = await createUser("sub-other");
  await grantPersona(env.DB, {
    userId: rider,
    persona: "theteam",
    grantedBy: admin,
  });
  await grantDefaultPersona(env.DB, other);

  const ids = await listUsersWithPersona(env.DB, "theteam");

  expect(ids).toEqual([rider]);
});
