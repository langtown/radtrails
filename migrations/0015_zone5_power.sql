-- Migration number: 0015 	 2026-08-20T00:00:00.000Z
-- The single coach-set power number is the rider's Zone 5 (VO2 Max) power,
-- not FTP. FTP is derived (zone5 / 1.13) and all seven Coggan zones follow.
-- Rename the column so the schema says what the value means.

ALTER TABLE athlete_ftp RENAME COLUMN ftp_watts TO zone5_watts;
