-- Migration number: 0004 	 2026-08-14T00:00:00.000Z
-- Personas: the membership mechanism (radtrails-osq.19).
--
-- A user holds zero or more personas. This is what decides where - and
-- whether - they appear on the public site. Deliberately many-to-many rather
-- than a single column: Bobby Langin is both a coach and the featured entry in
-- the racers list, so a one-value column could not represent the real site.
--
-- This also replaces the users.is_admin flag from the first draft of the
-- epic. Admin is a persona, so authorization has one mechanism, not two.
--
-- Persona is only the first of two gates. It decides whether and where a user
-- appears; profiles.status decides whether their current content is published.

CREATE TABLE personas (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_personas (
    user_id INTEGER NOT NULL,
    persona_key TEXT NOT NULL,
    granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER,
    PRIMARY KEY (user_id, persona_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (persona_key) REFERENCES personas(key),
    FOREIGN KEY (granted_by) REFERENCES users(id)
);

CREATE INDEX user_personas_persona_idx ON user_personas(persona_key);

-- is_public marks personas whose holders can appear in public listings.
-- member is what every new account gets: an account, and no public presence.
INSERT INTO personas (key, label, is_public, sort_order) VALUES
    ('member',  'Member',  0, 0),
    ('theteam', 'TheTeam', 1, 1),
    ('coach',   'Coach',   1, 2),
    ('alumni',  'Alumni',  1, 3),
    ('admin',   'Admin',   0, 4);
