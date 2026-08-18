-- Migration number: 0010 	 2026-08-18T00:00:00.000Z
-- Sponsors are authored with the rest of a profile and share its review
-- status. Stored as a JSON array of plain-text names; the API owns the shape
-- (array entries, per-name length, and total count are validated there).

ALTER TABLE profiles
ADD COLUMN sponsors TEXT NOT NULL DEFAULT '[]'
CHECK (json_valid(sponsors) AND json_type(sponsors) = 'array');

ALTER TABLE published_profiles
ADD COLUMN sponsors TEXT NOT NULL DEFAULT '[]'
CHECK (json_valid(sponsors) AND json_type(sponsors) = 'array');
