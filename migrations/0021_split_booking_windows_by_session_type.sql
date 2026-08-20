-- Booking rules move from one set per coach to one set per (coach, session
-- type). Only Intervals and Lesson bookings are ever checked against them —
-- practice rides are team-wide events, not subject to per-rider booking
-- constraints, so they are not represented here at all.

ALTER TABLE coach_booking_windows RENAME TO coach_booking_windows_old;

CREATE TABLE coach_booking_windows (
    coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL CHECK (session_type IN ('intervals', 'lesson')),
    allowed_days_mask INTEGER NOT NULL DEFAULT 127, -- bit i (0=Sun..6=Sat) set = bookable
    blackout_1_start TEXT, -- 'HH:MM', site-local; NULL = window unused
    blackout_1_end TEXT,
    blackout_2_start TEXT,
    blackout_2_end TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (coach_id, session_type)
);

-- A coach's existing rules become their Intervals rules; Lessons starts
-- unconfigured (bookable any time) until the coach sets it separately.
INSERT INTO coach_booking_windows
    (coach_id, session_type, allowed_days_mask, blackout_1_start, blackout_1_end,
     blackout_2_start, blackout_2_end, updated_at)
SELECT coach_id, 'intervals', allowed_days_mask, blackout_1_start, blackout_1_end,
       blackout_2_start, blackout_2_end, updated_at
FROM coach_booking_windows_old;

DROP TABLE coach_booking_windows_old;
