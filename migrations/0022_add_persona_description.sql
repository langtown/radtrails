-- Migration number: 0022     2026-08-20T00:00:00.000Z
-- Add a description column to the personas table so each persona may carry
-- a human-readable purpose statement. Seed descriptions for the existing
-- personas and newly-added radfriends/private personas.

ALTER TABLE personas ADD COLUMN description TEXT DEFAULT '';

-- Seed helpful descriptions for admins and editors. These may be edited
-- later via a CMS or by adding another migration.

UPDATE personas SET description = 'A registered account; no public presence by default.' WHERE key = 'member';
UPDATE personas SET description = 'Featured team members who appear on the racing/team pages.' WHERE key = 'theteam';
UPDATE personas SET description = 'Coaches who offer paid or free coaching services and appear on the services page.' WHERE key = 'coach';
UPDATE personas SET description = 'Former team members who are kept as alumni on the site.' WHERE key = 'alumni';
UPDATE personas SET description = 'Administrative accounts with the ability to grant and revoke personas and review content.' WHERE key = 'admin';
UPDATE personas SET description = 'Friends of the project with lightweight public presence (rad friends).' WHERE key = 'radfriends';
UPDATE personas SET description = 'Private accounts used for internal or non-public purposes.' WHERE key = 'private';
