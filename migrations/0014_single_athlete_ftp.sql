-- Migration number: 0014 	 2026-08-20T00:00:00.000Z
-- Each rider has exactly one FTP (radtrails-zg5 follow-up). The five-zone
-- athlete_ftp_zones table was overbuilt: zones can be derived from a single
-- FTP wherever they are needed. Backfill takes z4 (threshold) as the FTP.

CREATE TABLE athlete_ftp (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ftp_watts INTEGER NOT NULL CHECK (ftp_watts BETWEEN 1 AND 3000),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER NOT NULL REFERENCES users(id)
);

INSERT INTO athlete_ftp (user_id, ftp_watts, updated_at, updated_by)
SELECT user_id, z4_watts, updated_at, updated_by
FROM athlete_ftp_zones
WHERE session_type = 'intervals' AND z4_watts IS NOT NULL;

DROP TABLE athlete_ftp_zones;
