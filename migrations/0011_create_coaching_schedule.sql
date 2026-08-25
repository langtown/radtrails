-- Migration number: 0011 	 2026-08-18T00:00:00.000Z
-- Coach scheduling for Intervals sessions (see docs/superpowers/specs/2026-08-18-coach-scheduling-design.md).
--
-- weekly_assignments is the coach's standing weekly commitment: "this rider,
-- this day, this time, every week, until changed." session_occurrences are
-- dated instances generated from it, not entered by hand. Fields that
-- describe "what happens" are denormalized onto session_occurrences at
-- generation time so rescheduling one date, or later changing the weekly
-- rule, never rewrites history.

CREATE TABLE weekly_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL DEFAULT 'intervals',
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday
    start_time TEXT NOT NULL, -- 'HH:MM', 24-hour, site-local time
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE INDEX weekly_assignments_coach_idx ON weekly_assignments(coach_id, active);
CREATE INDEX weekly_assignments_rider_idx ON weekly_assignments(rider_id, active);

CREATE TABLE session_occurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weekly_assignment_id INTEGER NOT NULL REFERENCES weekly_assignments(id) ON DELETE CASCADE,
    coach_id INTEGER NOT NULL REFERENCES users(id),
    rider_id INTEGER NOT NULL REFERENCES users(id),
    session_type TEXT NOT NULL,
    occurrence_date TEXT NOT NULL, -- 'YYYY-MM-DD'
    start_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (weekly_assignment_id, occurrence_date)
);

CREATE INDEX session_occurrences_coach_date_idx
    ON session_occurrences(coach_id, occurrence_date, start_time);
CREATE INDEX session_occurrences_rider_idx ON session_occurrences(rider_id, occurrence_date);

CREATE TABLE athlete_ftp_zones (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL DEFAULT 'intervals',
    z1_watts INTEGER,
    z2_watts INTEGER,
    z3_watts INTEGER,
    z4_watts INTEGER,
    z5_watts INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (user_id, session_type)
);

-- Rider-authored, unmoderated: separate from `profiles`, which is gated by
-- admin review. A playlist link needs to be live before next practice, not
-- after review.
CREATE TABLE athlete_playlists (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    playlist_url TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
