-- Migration number: 0001 	 2026-08-14T00:00:00.000Z
-- Authentication and per-user storage for direct Google OAuth (radtrails-osq.2).
--
-- Identity is keyed on the Google ID token's immutable `sub` claim, never on
-- email: a Google account's email address can change, `sub` cannot.
--
-- `sessions.id_hash` holds the SHA-256 hash of the opaque session token. The
-- raw token only ever exists in the user's cookie, so a leaked database dump
-- cannot be replayed as a login.

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT,
    display_name TEXT,
    picture_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE user_data (
    user_id INTEGER NOT NULL,
    data_key TEXT NOT NULL,
    data_value TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, data_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
