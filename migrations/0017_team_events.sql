-- Migration number: 0017 	 2026-08-20T00:00:00.000Z
-- Team-wide Practice Ride events (radtrails-5xt). Unlike weekly_assignments,
-- a team event is one shared occurrence for every theteam rider, not a
-- per-rider series. Absence is opt-out: a rider marks themselves "not
-- available" in team_event_absences; everyone else is assumed attending.

CREATE TABLE team_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL DEFAULT 'practiceride',
    event_date TEXT NOT NULL, -- 'YYYY-MM-DD'
    start_time TEXT NOT NULL, -- 'HH:MM', site-local
    duration_minutes INTEGER NOT NULL,
    location_url TEXT NOT NULL, -- Google Maps meetup link
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE INDEX team_events_date_idx ON team_events(event_date);

CREATE TABLE team_event_absences (
    event_id INTEGER NOT NULL REFERENCES team_events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, user_id)
);
