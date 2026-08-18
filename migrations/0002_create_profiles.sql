-- Migration number: 0002 	 2026-08-14T00:00:00.000Z
-- Public racer profiles (radtrails-osq.12).
--
-- Distinct from user_data: that table is private per-user storage, this one is
-- content published on the site. Fields mirror the `racers` shape in
-- lib/content/racing.ts (name, image, bio, imagePosition) so the racing page
-- can eventually source from here.
--
-- `status` gates publication. A profile is only ever publicly readable as
-- 'approved'; every edit sends it back to 'pending' for admin review. Being
-- in TheTeam is a separate gate, handled by the persona model.
--
-- `image_key` is a content hash, not a URL. The bytes live in the separate
-- D1 profile_images table; profiles hold only the immutable reference.

CREATE TABLE profiles (
    user_id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    bio TEXT,
    image_key TEXT,
    image_position TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    submitted_at TEXT,
    reviewed_at TEXT,
    reviewed_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE INDEX profiles_status_idx ON profiles(status);
