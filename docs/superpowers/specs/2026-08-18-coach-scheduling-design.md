# Coach Scheduling (Intervals Calendar) — Design

Status: approved for implementation
Date: 2026-08-18

## Problem

Coaches (currently just the "Intervals" spin-bike sessions) need to run a weekly schedule: each
rider gets the same weekly hour, on the same two bikes, every week, until the coach changes it. The
coach also tracks each rider's current FTP watt targets for Z1–Z5, and the rider can leave a playlist
link for the coach to play during the session. Admins need the same management ability as the coach,
for any coach's calendar. Today none of this exists — there is no scheduling, no FTP data, and no
playlist field anywhere in the app.

## Scope

In scope: one session category, `intervals`, run by users holding the `coach` persona, scheduling
riders who hold `theteam` persona, with a 2-riders-per-slot cap tied to physical bike count.

Explicitly deferred, not built now: a second session type (e.g. private lessons — the schema leaves
room but no second type is implemented), FTP history/trend tracking (only current values are stored),
rider self-service booking (coach/admin assign only, per product decision below), email/notification
on schedule changes, multi-timezone handling (single site-local timezone assumed, matching the rest
of the app).

## Product decisions (from brainstorming)

- **Dated calendar, not a bare weekly grid.** Each week is a real dated `session_occurrence` that can
  be individually rescheduled or cancelled (e.g. skip one week for a holiday) without altering the
  underlying weekly commitment.
- **Occurrences are generated from a recurring rule**, not entered by hand each week. A coach sets a
  `weekly_assignment` (rider, day-of-week, time) once; dated occurrences are generated from it,
  8 weeks ahead on a rolling basis.
- **Capacity (2 riders) is per coach, per session type**, not a site-wide cap. It exists because a
  given coach's studio has exactly two bikes; it is not a rule about `intervals` in general or about
  other coaches.
- **Coach/Admin assign riders; riders do not self-book.** A rider only ever views their own
  assignment and edits their own playlist link.
- **FTP zones are 5 independent coach-entered watt values**, not computed from a single FTP number
  via standard percentages. The coach has full manual control per zone.
- **Playlist is a single URL**, validated like the existing profile social links, stored separately
  from the moderated `profiles` table so it takes effect immediately with no admin review step.
- **Occurrence generation is lazy** (generated on read, idempotently, when anyone views a schedule),
  not a Cloudflare Cron Trigger. No new infrastructure; the small staleness window this allows is
  invisible to users because generation always completes before the response that would show it.
- **`session_type` is a plain text column with a code-level constant list**, not a new lookup table
  like `personas`. Only `intervals` exists; nothing here has per-type metadata worth a table yet.

## Data model

New migration `migrations/0011_create_coaching_schedule.sql`:

```sql
-- The coach's standing weekly commitment: "this rider, this day, this time,
-- every week, until changed." Dated sessions are generated from this, not
-- entered by hand — see session_occurrences.
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

-- One dated instance of a weekly_assignment. Fields that describe "what
-- happens" are denormalized from the assignment at generation time so that
-- rescheduling one date, or later changing the weekly rule, never rewrites
-- history.
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

-- Current FTP zone watts a coach has set for a rider. Latest value only — no
-- history; add a history table later if trend tracking is ever requested.
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
```

## Capacity enforcement

Two checks, against two different tables, because a slot's occupancy has two sources:

1. **Creating a `weekly_assignment`**: reject with 409 if `weekly_assignments` already has 2 rows
   with `active = 1` for the same `(coach_id, session_type, day_of_week, start_time)`.
2. **Rescheduling a `session_occurrence`** to a new date/time: reject with 409 if
   `session_occurrences` already has 2 rows with `status = 'scheduled'` for the target
   `(coach_id, session_type, occurrence_date, start_time)`, excluding the occurrence being moved.

Both checks run inside the same D1 call that performs the write (read-then-write in one
`db.batch`/transaction-shaped call), not as a separate pre-check the client could race.

## Lib files

Following `docs/api-design.md`: one file per concern, `D1Database` as first argument, typed error
class per file carrying an HTTP `status`.

- **`lib/coaching-constraints.ts`** — `SESSION_TYPES = ['intervals'] as const`,
  `SCHEDULABLE_RIDER_PERSONAS = ['theteam'] as const`, `OCCURRENCE_WINDOW_WEEKS = 8`, time-format
  (`HH:MM`) and FTP-watt validation helpers.
- **`lib/weekly-assignments.ts`** — `createWeeklyAssignment`, `listWeeklyAssignmentsForCoach`,
  `deactivateWeeklyAssignment` (also cancels that assignment's own future `scheduled` occurrences).
  `ScheduleAssignmentError`.
- **`lib/session-occurrences.ts`** — `ensureOccurrencesGenerated(db, throughDate)` (idempotent,
  `INSERT ... WHERE NOT EXISTS` per assignment/date pair), `listOccurrencesForCoach`,
  `listOccurrencesForRider`, `rescheduleOccurrence`, `cancelOccurrence`. `ScheduleOccurrenceError`.
- **`lib/athlete-ftp.ts`** — `getFtpZones`, `setFtpZones` (requires the rider to currently hold an
  active `weekly_assignment` with that coach+session_type). `FtpZoneError`.
- **`lib/athlete-playlist.ts`** — `getPlaylist`, `setPlaylist` (self-service only — the caller can
  only ever write their own row). `PlaylistError`.

Authorization used throughout: actor must hold `admin`, or `actorId === coachId`. Implemented once
(`requireCoachOrAdmin(db, request, coachId)` in `lib/weekly-assignments.ts`, reused by the other
schedule-related lib files) rather than reimplemented per function, mirroring `requireAdminUser` in
`lib/persona-admin.ts`.

## API routes

All routes wrap `secureApiResponse`/`handleApiOptions`, per `docs/api-design.md`, and use the
`WRITE_RATE_LIMITER` binding on any state-changing method:

```
GET/POST   /api/coaches/[coachId]/schedule
    GET:  weekly assignments + occurrences generated through the rolling window
    POST: create a weekly assignment (rider_id, session_type, day_of_week, start_time, duration_minutes)

DELETE     /api/coaches/[coachId]/schedule/[assignmentId]
    Deactivates the weekly assignment; cancels its own future scheduled occurrences.

PATCH      /api/coaches/[coachId]/occurrences/[occurrenceId]
    Body: { action: 'reschedule', occurrence_date, start_time } | { action: 'cancel' }

GET/PUT    /api/coaches/[coachId]/riders/[riderId]/ftp
    Z1-Z5 watts for that rider under that coach+session_type.

GET        /api/me/sessions
    The signed-in rider's own upcoming occurrences (read-only).

GET/PUT    /api/me/playlist
    The signed-in rider's own playlist_url.
```

`GET /api/coaches/[coachId]/schedule` embeds each rider's `display_name` and `playlist_url` in the
response so the coach's view never needs a second request to see what to play.

## UI

- **`app/coach/page.tsx`** — new route, rendered only for `coach` persona holders (checked via
  `getCurrentUser()` + `hasPersona`, redirect otherwise). Weekly grid of assignments; add-rider
  control limited to a dropdown of `theteam` holders not already at that slot's capacity; per-date
  reschedule/cancel controls; FTP zone editor per rider.
- **`app/admin/coaches/page.tsx`** — list of `coach` persona holders (reuses `listUsersWithPersona`),
  linking to:
- **`app/admin/coaches/[id]/page.tsx`** — the identical schedule manager component, `coachId` passed
  as a prop instead of resolved from session. Mirrors the existing
  `app/admin/profiles/manage/edit/[slug]/page.tsx` admin-acts-on-behalf-of pattern.
- **`app/profile/ProfileEditor.tsx`** — add a "Playlist URL" field (HTTPS validation, same treatment
  as the existing social link fields) and a small read-only "My Sessions" panel sourced from
  `GET /api/me/sessions`.

The coach-facing manager component (grid + assignment form + FTP editor) is written once and shared
between `app/coach/page.tsx` and `app/admin/coaches/[id]/page.tsx` via a `coachId` prop, the same way
`AdminProfilesManager` is shared across admin profile-editing surfaces.

## Testing

Per `docs/api-design.md`, `lib/` functions are exercised directly against real D1 in
`tests/*.test.ts`:

- `tests/weekly-assignments.test.ts` — capacity (2 ok, 3rd rejected with 409), only `coach`/`admin`
  can create, only `theteam` holders can be assigned as riders, deactivation cancels future
  occurrences.
- `tests/session-occurrences.test.ts` — `ensureOccurrencesGenerated` is idempotent across repeated
  calls, generates exactly `OCCURRENCE_WINDOW_WEEKS` of dates, reschedule capacity check against
  `session_occurrences` (collision with an unrelated occupied slot rejected), cancel sets status
  without deleting the row.
- `tests/athlete-ftp.test.ts` — set requires an active assignment with that coach, get/set scoped to
  `(user_id, session_type)`.
- `tests/athlete-playlist.test.ts` — a user can only write their own row; a coach's schedule read
  surfaces the rider's playlist without a second request.
- `tests/coach-schedule-authorization.test.ts` — a coach cannot act on another coach's `coachId`; a
  non-admin, non-coach actor is rejected on every route; admin can act on any coach.

## Migration checklist

- `migrations/0011_create_coaching_schedule.sql` as above.
- `npm run cf:types` if any new binding were introduced — none are; skip.
- `npm run db:migrate:local` before running tests/dev.
