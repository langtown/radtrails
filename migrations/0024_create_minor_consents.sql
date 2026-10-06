-- Migration number: 0024 	 2026-10-05T00:00:00.000Z
-- Stores a parent/guardian's e-signed consent for a minor's public profile.
-- One row per user; re-signing replaces the row. The typed signature plus the
-- timestamp are the record of consent, and consent_version pins which
-- disclosure text was agreed to so later wording changes are auditable.
CREATE TABLE minor_consents (
    user_id INTEGER PRIMARY KEY,
    minor_name TEXT NOT NULL,
    guardian_name TEXT NOT NULL,
    guardian_relationship TEXT NOT NULL,
    signature TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    agreed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
