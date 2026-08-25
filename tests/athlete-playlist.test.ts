import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { PlaylistError, getPlaylist, setPlaylist } from "@/lib/athlete-playlist";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub) VALUES (?) RETURNING id",
  )
    .bind(googleSub)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");
  return row.id;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("a user can set and read their own playlist URL", async () => {
  const userId = await createUser("sub-rider");

  await setPlaylist(env.DB, userId, "https://open.spotify.com/playlist/abc");

  expect(await getPlaylist(env.DB, userId)).toEqual({
    playlistUrl: "https://open.spotify.com/playlist/abc",
  });
});

test("an empty string clears the playlist", async () => {
  const userId = await createUser("sub-rider");
  await setPlaylist(env.DB, userId, "https://open.spotify.com/playlist/abc");

  await setPlaylist(env.DB, userId, "");

  expect(await getPlaylist(env.DB, userId)).toEqual({ playlistUrl: null });
});

test("a non-https URL is rejected", async () => {
  const userId = await createUser("sub-rider");

  await expect(
    setPlaylist(env.DB, userId, "http://example.com/playlist"),
  ).rejects.toBeInstanceOf(PlaylistError);
});

test("a value that is not a URL at all is rejected", async () => {
  const userId = await createUser("sub-rider");

  await expect(setPlaylist(env.DB, userId, "not a url")).rejects.toBeInstanceOf(
    PlaylistError,
  );
});

test("reading a playlist that was never set returns null, not an error", async () => {
  const userId = await createUser("sub-rider");

  expect(await getPlaylist(env.DB, userId)).toEqual({ playlistUrl: null });
});
