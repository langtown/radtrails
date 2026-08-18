-- Migration number: 0008 	 2026-08-18T00:00:00.000Z
-- The editable profile row returns to pending on every edit. This approved
-- snapshot keeps the last reviewed version public until an admin approves the
-- replacement, preventing unreviewed text or links from reaching public APIs.

CREATE TABLE published_profiles (
    user_id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    bio TEXT,
    image_key TEXT,
    image_position TEXT,
    social_links TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(social_links) AND json_type(social_links) = 'object'),
    published_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX published_profiles_slug_idx ON published_profiles(slug);
