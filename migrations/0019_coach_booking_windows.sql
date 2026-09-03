-- Migration number: 0019 	 2026-08-20T00:00:00.000Z
-- Per-coach constraints on when Intervals/Lesson/Practice Ride entries may be
-- booked: which days of the week are bookable at all, plus up to two
-- blackout time windows (e.g. overnight, late evening) that apply on every
-- allowed day. No row for a coach means unconfigured: every day and time is
-- bookable, so existing coaches are unaffected until they opt in.

CREATE TABLE coach_booking_windows (
    coach_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    allowed_days_mask INTEGER NOT NULL DEFAULT 127, -- bit i (0=Sun..6=Sat) set = bookable
    blackout_1_start TEXT, -- 'HH:MM', site-local; NULL = window unused
    blackout_1_end TEXT,
    blackout_2_start TEXT,
    blackout_2_end TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
