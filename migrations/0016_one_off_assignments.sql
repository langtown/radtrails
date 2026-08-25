-- Migration number: 0016 	 2026-08-20T00:00:00.000Z
-- Lessons are one-off appointments on a specific date; Intervals recur
-- weekly. one_off marks assignments whose single occurrence is inserted at
-- creation time so occurrence generation skips them.

ALTER TABLE weekly_assignments ADD COLUMN one_off INTEGER NOT NULL DEFAULT 0;
