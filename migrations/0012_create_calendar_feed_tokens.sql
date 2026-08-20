-- Migration number: 0012 	 2026-08-19T00:00:00.000Z
-- Per-user secret tokens for iCal feeds (radtrails-fda). The token is the only
-- credential the feed URL carries: calendar apps fetch it without a session, so
-- anyone holding the URL can read that user's schedule. Rotation replaces it
-- atomically; ON DELETE CASCADE keeps tokens from outliving their account.

CREATE TABLE calendar_feed_tokens (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rotated_at TEXT
);
