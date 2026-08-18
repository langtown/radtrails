-- Migration number: 0006 	 2026-08-18T00:00:00.000Z
-- Social links are authored with the rest of a profile and share its review
-- status. The API owns the JSON shape: callers can submit only the supported
-- platform keys and validated HTTPS URLs.

ALTER TABLE profiles
ADD COLUMN social_links TEXT NOT NULL DEFAULT '{}'
CHECK (json_valid(social_links) AND json_type(social_links) = 'object');
