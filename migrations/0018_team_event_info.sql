-- Migration number: 0018 	 2026-08-20T00:00:00.000Z
-- Free-text info a coach can attach to a team ride (route notes, pace, what
-- to bring), shown alongside the existing meetup link and surfaced in the
-- calendar feed description.

ALTER TABLE team_events ADD COLUMN info TEXT;
