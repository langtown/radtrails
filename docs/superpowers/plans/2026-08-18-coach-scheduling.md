# Coach Scheduling (Intervals Calendar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coach (or an admin, on a coach's behalf) run a weekly Intervals schedule: recurring weekly rider assignments, dated sessions generated from those rules, a 2-rider-per-slot cap tied to physical bike count, coach-entered FTP Z1-Z5 watts per rider, and a rider-editable playlist link.

**Architecture:** New D1 tables (`weekly_assignments`, `session_occurrences`, `athlete_ftp_zones`, `athlete_playlists`) behind `lib/` domain functions that take `D1Database` first and enforce authorization/capacity themselves; thin Next.js route handlers; two new UI surfaces (`app/coach`, `app/admin/coaches`) sharing one `CoachScheduleManager` component; two small additions to the existing profile page.

**Tech Stack:** Next.js App Router route handlers, Cloudflare D1, Vitest + `@cloudflare/vitest-pool-workers` against real D1, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-18-coach-scheduling-design.md`

## Global Constraints

- Run `nvm use` before any `npm` command in this project.
- Every `lib/` function takes `D1Database` as its first argument and never calls `getCloudflareContext()` — only route handlers and page components do, via `getDb()`/`getAppRuntime()` from `lib/db.ts`.
- Every `/api/*` route wraps its handler in `secureApiResponse()` and exports `handleApiOptions` as `OPTIONS` (`lib/api-security.ts`).
- Every state-changing route (`POST`/`PUT`/`PATCH`/`DELETE`) checks `rateLimitResponse(request, rateLimiters.write, "<group>", 60)` before touching D1 or authenticating.
- Authorization is checked inside the `lib/` domain function, not only in the route, so it cannot be bypassed by calling the function directly.
- Every SQL statement uses `db.prepare(...).bind(...)`. Never interpolate values into SQL text.
- Error responses are always `{ "error": "message" }` with the matching HTTP status: 400 validation, 401 unauthenticated, 403 unauthorized, 404 not found, 409 conflict.
- Each resource area's errors are one `Error` subclass with a `status: number` field, per `docs/api-design.md`.
- Migration files are added under `migrations/` with a monotonically increasing number; never edit an already-applied migration.
- Tests import `env` from `cloudflare:test` and run against real D1 (seeded automatically from `migrations/` by `tests/apply-migrations.ts`); they call `lib/` functions directly, never the Next.js route file (route files call `getCloudflareContext()`, unavailable under the Vitest pool).
- UI component tests use `renderToStaticMarkup` from `react-dom/server` and assert on rendered HTML strings, matching `tests/profile-editor.test.ts`/`tests/admin-ui.test.ts` — no interaction/click testing framework is set up in this project.
- Route files with URL params (`[coachId]`, etc.) have no dedicated automated test, matching the existing `app/api/admin/users/[id]/personas/route.ts` — verify them manually against the dev server as documented per task.

## File Structure

```
migrations/0011_create_coaching_schedule.sql   new tables

lib/coaching-constraints.ts    constants + validators shared by the files below
lib/weekly-assignments.ts      recurring rule CRUD, requireCoachOrAdmin, listSchedulableRiders
lib/session-occurrences.ts     dated-occurrence generation/list/reschedule/cancel
lib/athlete-ftp.ts             FTP Z1-Z5 get/set
lib/athlete-playlist.ts        rider playlist URL get/set (self-service)

app/api/coaches/[coachId]/schedule/route.ts                     GET/POST
app/api/coaches/[coachId]/schedule/[assignmentId]/route.ts      DELETE
app/api/coaches/[coachId]/occurrences/[occurrenceId]/route.ts   PATCH
app/api/coaches/[coachId]/riders/[riderId]/ftp/route.ts         GET/PUT
app/api/me/sessions/route.ts                                    GET
app/api/me/playlist/route.ts                                    GET/PUT

app/coach/CoachScheduleManager.tsx   shared client component (grid, add-rider, FTP, reschedule/cancel)
app/coach/page.tsx                   coach's own calendar (server component, direct DB gating)
app/admin/coaches/page.tsx           list of coaches (server component)
app/admin/coaches/[id]/page.tsx      admin managing one coach's calendar (client component, matches
                                      the existing app/admin/profiles/manage/edit/[slug]/page.tsx
                                      dynamic-segment pattern)

app/profile/PlaylistEditor.tsx   new self-contained playlist field
app/profile/MySessions.tsx       new read-only upcoming-sessions panel
app/profile/page.tsx             modified: fetch playlist + sessions, render the two components above

tests/coaching-constraints.test.ts
tests/weekly-assignments.test.ts
tests/session-occurrences.test.ts
tests/athlete-ftp.test.ts
tests/athlete-playlist.test.ts
tests/coach-schedule-ui.test.ts
tests/profile-playlist-ui.test.ts
```

---

### Task 1: Migration

**Files:**
- Create: `migrations/0011_create_coaching_schedule.sql`

**Interfaces:**
- Produces: tables `weekly_assignments`, `session_occurrences`, `athlete_ftp_zones`, `athlete_playlists`, used by every later task.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply it locally and confirm the tables exist**

Run: `nvm use && npm run db:migrate:local`
Expected: migration `0011_create_coaching_schedule` applies with no error.

Run: `npm run db:console:local -- ".tables"`
Expected: output includes `weekly_assignments`, `session_occurrences`, `athlete_ftp_zones`, `athlete_playlists`.

- [ ] **Step 3: Commit**

```bash
git add migrations/0011_create_coaching_schedule.sql
git commit -m "feat: add coach scheduling tables"
```

---

### Task 2: `lib/coaching-constraints.ts`

**Files:**
- Create: `lib/coaching-constraints.ts`
- Test: `tests/coaching-constraints.test.ts`

**Interfaces:**
- Produces: `SESSION_TYPES: readonly ["intervals"]`, `SessionType`, `SCHEDULABLE_RIDER_PERSONAS: readonly ["theteam"]`, `OCCURRENCE_WINDOW_WEEKS: 8`, `MAX_RIDERS_PER_SLOT: 2`, `DAYS_OF_WEEK: readonly [7 strings]`, `isValidSessionType`, `isValidDayOfWeek`, `isValidTimeOfDay`, `isValidDurationMinutes`, `isValidIsoDate`, `isValidFtpWatts` — all used by Tasks 3-6 and the UI.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coaching-constraints.test.ts
import { expect, test } from "vitest";
import {
  MAX_RIDERS_PER_SLOT,
  OCCURRENCE_WINDOW_WEEKS,
  SESSION_TYPES,
  isValidDayOfWeek,
  isValidDurationMinutes,
  isValidFtpWatts,
  isValidIsoDate,
  isValidSessionType,
  isValidTimeOfDay,
} from "@/lib/coaching-constraints";

test("session types include intervals and nothing else yet", () => {
  expect(SESSION_TYPES).toEqual(["intervals"]);
  expect(isValidSessionType("intervals")).toBe(true);
  expect(isValidSessionType("private_lessons")).toBe(false);
  expect(isValidSessionType(42)).toBe(false);
});

test("day of week accepts 0-6 only", () => {
  expect(isValidDayOfWeek(0)).toBe(true);
  expect(isValidDayOfWeek(6)).toBe(true);
  expect(isValidDayOfWeek(7)).toBe(false);
  expect(isValidDayOfWeek(-1)).toBe(false);
  expect(isValidDayOfWeek(1.5)).toBe(false);
  expect(isValidDayOfWeek("1")).toBe(false);
});

test("time of day requires 24-hour HH:MM", () => {
  expect(isValidTimeOfDay("09:00")).toBe(true);
  expect(isValidTimeOfDay("23:59")).toBe(true);
  expect(isValidTimeOfDay("24:00")).toBe(false);
  expect(isValidTimeOfDay("9:00")).toBe(false);
  expect(isValidTimeOfDay("09:00:00")).toBe(false);
});

test("duration is a positive integer capped at 240 minutes", () => {
  expect(isValidDurationMinutes(60)).toBe(true);
  expect(isValidDurationMinutes(240)).toBe(true);
  expect(isValidDurationMinutes(0)).toBe(false);
  expect(isValidDurationMinutes(241)).toBe(false);
  expect(isValidDurationMinutes(60.5)).toBe(false);
});

test("iso dates must be real calendar dates in YYYY-MM-DD form", () => {
  expect(isValidIsoDate("2026-08-18")).toBe(true);
  expect(isValidIsoDate("2026-02-30")).toBe(false);
  expect(isValidIsoDate("08-18-2026")).toBe(false);
  expect(isValidIsoDate("2026-8-18")).toBe(false);
});

test("FTP watts must be a positive integer within range", () => {
  expect(isValidFtpWatts(200)).toBe(true);
  expect(isValidFtpWatts(0)).toBe(false);
  expect(isValidFtpWatts(3001)).toBe(false);
  expect(isValidFtpWatts(200.5)).toBe(false);
});

test("the rolling generation window and per-slot cap match the design", () => {
  expect(OCCURRENCE_WINDOW_WEEKS).toBe(8);
  expect(MAX_RIDERS_PER_SLOT).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coaching-constraints.test.ts`
Expected: FAIL — `lib/coaching-constraints` has no exported member (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// lib/coaching-constraints.ts
/** The only session category today. Adding a second is a code change here, not a schema migration. */
export const SESSION_TYPES = ["intervals"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/** Which personas may be scheduled as a rider. Extending this list is the whole change. */
export const SCHEDULABLE_RIDER_PERSONAS = ["theteam"] as const;

/** How far ahead dated occurrences are kept generated. */
export const OCCURRENCE_WINDOW_WEEKS = 8;

/** Two bikes: a coach's slot can hold at most this many riders. */
export const MAX_RIDERS_PER_SLOT = 2;

export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function isValidSessionType(value: unknown): value is SessionType {
  return (
    typeof value === "string" &&
    (SESSION_TYPES as readonly string[]).includes(value)
  );
}

export function isValidDayOfWeek(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  );
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeOfDay(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function isValidDurationMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 240
  );
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    value === parsed.toISOString().slice(0, 10)
  );
}

export function isValidFtpWatts(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 3000
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coaching-constraints.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/coaching-constraints.ts tests/coaching-constraints.test.ts
git commit -m "feat: add coaching schedule constants and validators"
```

---

### Task 3: `lib/weekly-assignments.ts`

**Files:**
- Create: `lib/weekly-assignments.ts`
- Test: `tests/weekly-assignments.test.ts`

**Interfaces:**
- Consumes: `SESSION_TYPES`, `SCHEDULABLE_RIDER_PERSONAS`, `MAX_RIDERS_PER_SLOT`, `isValidDayOfWeek`, `isValidDurationMinutes`, `isValidSessionType`, `isValidTimeOfDay`, `type SessionType` (Task 2); `hasPersona` (`lib/personas.ts`, existing).
- Produces: `class ScheduleAssignmentError extends Error { status: number }`; `type WeeklyAssignment = { id, coachId, riderId, riderDisplayName, sessionType, dayOfWeek, startTime, durationMinutes }`; `requireCoachOrAdmin(db, actorId, coachId): Promise<void>` (reused by Tasks 4-5); `createWeeklyAssignment(db, { actorId, coachId, riderId, sessionType, dayOfWeek, startTime, durationMinutes }): Promise<WeeklyAssignment>`; `listWeeklyAssignmentsForCoach(db, actorId, coachId): Promise<WeeklyAssignment[]>`; `deactivateWeeklyAssignment(db, actorId, coachId, assignmentId): Promise<void>`; `type SchedulableRider = { id, displayName }`; `listSchedulableRiders(db): Promise<SchedulableRider[]>`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/weekly-assignments.test.ts
import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import {
  ScheduleAssignmentError,
  createWeeklyAssignment,
  deactivateWeeklyAssignment,
  listSchedulableRiders,
  listWeeklyAssignmentsForCoach,
  requireCoachOrAdmin,
} from "@/lib/weekly-assignments";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, display_name) VALUES (?, ?) RETURNING id",
  )
    .bind(googleSub, googleSub)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function createAdmin(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'admin')",
  )
    .bind(id)
    .run();
  return id;
}

async function createCoach(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'coach')",
  )
    .bind(id)
    .run();
  return id;
}

async function createRider(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await grantDefaultPersona(env.DB, id);
  await grantPersona(env.DB, {
    userId: id,
    persona: "theteam",
    grantedBy: await createAdmin(`${googleSub}-granter`),
  });
  return id;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("a coach can create a weekly assignment for an eligible rider", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");

  const assignment = await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  expect(assignment.riderId).toBe(rider);
  expect(assignment.dayOfWeek).toBe(2);
});

test("a rider without a schedulable persona is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const memberOnly = await createUser("sub-member");
  await grantDefaultPersona(env.DB, memberOnly);

  await expect(
    createWeeklyAssignment(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: memberOnly,
      sessionType: "intervals",
      dayOfWeek: 2,
      startTime: "17:00",
      durationMinutes: 60,
    }),
  ).rejects.toBeInstanceOf(ScheduleAssignmentError);
});

test("a third rider at the same coach/day/time is rejected: only two bikes", async () => {
  const coach = await createCoach("sub-coach");
  const first = await createRider("sub-rider-1");
  const second = await createRider("sub-rider-2");
  const third = await createRider("sub-rider-3");
  const slot = {
    sessionType: "intervals" as const,
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  };

  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: first,
    ...slot,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: second,
    ...slot,
  });

  await expect(
    createWeeklyAssignment(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: third,
      ...slot,
    }),
  ).rejects.toMatchObject({ status: 409 });
});

test("a coach cannot manage another coach's calendar", async () => {
  const coachA = await createCoach("sub-coach-a");
  const coachB = await createCoach("sub-coach-b");
  const rider = await createRider("sub-rider");

  await expect(
    createWeeklyAssignment(env.DB, {
      actorId: coachA,
      coachId: coachB,
      riderId: rider,
      sessionType: "intervals",
      dayOfWeek: 1,
      startTime: "09:00",
      durationMinutes: 60,
    }),
  ).rejects.toMatchObject({ status: 403 });
});

test("an admin can create an assignment on any coach's calendar", async () => {
  const admin = await createAdmin("sub-admin");
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");

  const assignment = await createWeeklyAssignment(env.DB, {
    actorId: admin,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 3,
    startTime: "18:00",
    durationMinutes: 60,
  });

  expect(assignment.coachId).toBe(coach);
});

test("an unrelated actor cannot view a coach's assignments", async () => {
  const coach = await createCoach("sub-coach");
  const bystander = await createUser("sub-bystander");

  await expect(
    listWeeklyAssignmentsForCoach(env.DB, bystander, coach),
  ).rejects.toBeInstanceOf(ScheduleAssignmentError);
});

test("deactivating an assignment cancels its own future scheduled occurrences", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  const assignment = await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await env.DB.prepare(
    `INSERT INTO session_occurrences
       (weekly_assignment_id, coach_id, rider_id, session_type, occurrence_date, start_time, duration_minutes)
     VALUES (?, ?, ?, 'intervals', date('now', '+7 days'), '17:00', 60)`,
  )
    .bind(assignment.id, coach, rider)
    .run();

  await deactivateWeeklyAssignment(env.DB, coach, coach, assignment.id);

  expect(await listWeeklyAssignmentsForCoach(env.DB, coach, coach)).toHaveLength(0);
  const occurrence = await env.DB.prepare(
    "SELECT status FROM session_occurrences WHERE weekly_assignment_id = ?",
  )
    .bind(assignment.id)
    .first<{ status: string }>();
  expect(occurrence?.status).toBe("cancelled");
});

test("listSchedulableRiders returns only theteam holders", async () => {
  const rider = await createRider("sub-rider");
  const coachOnly = await createCoach("sub-coach-only");

  const riders = await listSchedulableRiders(env.DB);

  expect(riders.map((r) => r.id)).toContain(rider);
  expect(riders.map((r) => r.id)).not.toContain(coachOnly);
});

test("requireCoachOrAdmin allows the coach themselves and admins, refuses everyone else", async () => {
  const coach = await createCoach("sub-coach");
  const admin = await createAdmin("sub-admin");
  const bystander = await createUser("sub-bystander");

  await expect(requireCoachOrAdmin(env.DB, coach, coach)).resolves.toBeUndefined();
  await expect(requireCoachOrAdmin(env.DB, admin, coach)).resolves.toBeUndefined();
  await expect(
    requireCoachOrAdmin(env.DB, bystander, coach),
  ).rejects.toMatchObject({ status: 403 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/weekly-assignments.test.ts`
Expected: FAIL — `lib/weekly-assignments` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/weekly-assignments.ts
import {
  MAX_RIDERS_PER_SLOT,
  SCHEDULABLE_RIDER_PERSONAS,
  isValidDayOfWeek,
  isValidDurationMinutes,
  isValidSessionType,
  isValidTimeOfDay,
  type SessionType,
} from "./coaching-constraints";
import { hasPersona } from "./personas";

export class ScheduleAssignmentError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ScheduleAssignmentError";
    this.status = status;
  }
}

/** Confirms the actor may manage coachId's calendar: that coach, or an admin. */
export async function requireCoachOrAdmin(
  db: D1Database,
  actorId: number,
  coachId: number,
): Promise<void> {
  if (actorId === coachId) return;
  if (await hasPersona(db, actorId, "admin")) return;
  throw new ScheduleAssignmentError(
    "only the coach or an admin may manage this calendar",
    403,
  );
}

export type WeeklyAssignment = {
  id: number;
  coachId: number;
  riderId: number;
  riderDisplayName: string | null;
  sessionType: SessionType;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
};

async function riderDisplayName(
  db: D1Database,
  riderId: number,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT display_name FROM users WHERE id = ?")
    .bind(riderId)
    .first<{ display_name: string | null }>();
  return row?.display_name ?? null;
}

type CreateWeeklyAssignmentInput = {
  actorId: number;
  coachId: number;
  riderId: number;
  sessionType: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
};

export async function createWeeklyAssignment(
  db: D1Database,
  input: CreateWeeklyAssignmentInput,
): Promise<WeeklyAssignment> {
  const {
    actorId,
    coachId,
    riderId,
    sessionType,
    dayOfWeek,
    startTime,
    durationMinutes,
  } = input;

  await requireCoachOrAdmin(db, actorId, coachId);

  if (!isValidSessionType(sessionType)) {
    throw new ScheduleAssignmentError("unknown session type", 400);
  }
  if (!isValidDayOfWeek(dayOfWeek)) {
    throw new ScheduleAssignmentError("day_of_week must be 0-6", 400);
  }
  if (!isValidTimeOfDay(startTime)) {
    throw new ScheduleAssignmentError("start_time must be HH:MM", 400);
  }
  if (!isValidDurationMinutes(durationMinutes)) {
    throw new ScheduleAssignmentError("duration_minutes must be 1-240", 400);
  }

  let riderEligible = false;
  for (const persona of SCHEDULABLE_RIDER_PERSONAS) {
    if (await hasPersona(db, riderId, persona)) {
      riderEligible = true;
      break;
    }
  }
  if (!riderEligible) {
    throw new ScheduleAssignmentError(
      "the rider does not hold a schedulable persona",
      400,
    );
  }

  const occupied = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM weekly_assignments
       WHERE coach_id = ? AND session_type = ? AND day_of_week = ?
         AND start_time = ? AND active = 1`,
    )
    .bind(coachId, sessionType, dayOfWeek, startTime)
    .first<{ n: number }>();

  if ((occupied?.n ?? 0) >= MAX_RIDERS_PER_SLOT) {
    throw new ScheduleAssignmentError(
      "that slot already has two riders scheduled",
      409,
    );
  }

  const row = await db
    .prepare(
      `INSERT INTO weekly_assignments
         (coach_id, rider_id, session_type, day_of_week, start_time, duration_minutes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      coachId,
      riderId,
      sessionType,
      dayOfWeek,
      startTime,
      durationMinutes,
      actorId,
    )
    .first<{ id: number }>();

  if (!row) {
    throw new ScheduleAssignmentError("failed to create assignment", 500);
  }

  return {
    id: row.id,
    coachId,
    riderId,
    riderDisplayName: await riderDisplayName(db, riderId),
    sessionType,
    dayOfWeek,
    startTime,
    durationMinutes,
  };
}

export async function listWeeklyAssignmentsForCoach(
  db: D1Database,
  actorId: number,
  coachId: number,
): Promise<WeeklyAssignment[]> {
  await requireCoachOrAdmin(db, actorId, coachId);

  const { results } = await db
    .prepare(
      `SELECT wa.id, wa.coach_id, wa.rider_id, u.display_name AS rider_display_name,
              wa.session_type, wa.day_of_week, wa.start_time, wa.duration_minutes
       FROM weekly_assignments wa
       JOIN users u ON u.id = wa.rider_id
       WHERE wa.coach_id = ? AND wa.active = 1
       ORDER BY wa.day_of_week, wa.start_time, wa.id`,
    )
    .bind(coachId)
    .all<{
      id: number;
      coach_id: number;
      rider_id: number;
      rider_display_name: string | null;
      session_type: string;
      day_of_week: number;
      start_time: string;
      duration_minutes: number;
    }>();

  return results.map((row) => ({
    id: row.id,
    coachId: row.coach_id,
    riderId: row.rider_id,
    riderDisplayName: row.rider_display_name,
    sessionType: row.session_type as SessionType,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
  }));
}

/**
 * Deactivates a weekly assignment and cancels its own future scheduled
 * occurrences, so removing a rider frees the slot immediately rather than
 * leaving stale weeks behind.
 */
export async function deactivateWeeklyAssignment(
  db: D1Database,
  actorId: number,
  coachId: number,
  assignmentId: number,
): Promise<void> {
  await requireCoachOrAdmin(db, actorId, coachId);

  const result = await db
    .prepare(
      `UPDATE weekly_assignments SET active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND coach_id = ? AND active = 1`,
    )
    .bind(assignmentId, coachId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new ScheduleAssignmentError("assignment not found", 404);
  }

  await db
    .prepare(
      `UPDATE session_occurrences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE weekly_assignment_id = ? AND status = 'scheduled'
         AND occurrence_date >= date('now')`,
    )
    .bind(assignmentId)
    .run();
}

export type SchedulableRider = { id: number; displayName: string | null };

/** Every account holding a persona eligible to be scheduled (currently theteam). */
export async function listSchedulableRiders(
  db: D1Database,
): Promise<SchedulableRider[]> {
  const placeholders = SCHEDULABLE_RIDER_PERSONAS.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT DISTINCT u.id, u.display_name
       FROM users u
       JOIN user_personas up ON up.user_id = u.id
       WHERE up.persona_key IN (${placeholders})
       ORDER BY u.display_name, u.id`,
    )
    .bind(...SCHEDULABLE_RIDER_PERSONAS)
    .all<{ id: number; display_name: string | null }>();

  return results.map((row) => ({ id: row.id, displayName: row.display_name }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/weekly-assignments.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/weekly-assignments.ts tests/weekly-assignments.test.ts
git commit -m "feat: add weekly assignment management with capacity enforcement"
```

---

### Task 4: `lib/session-occurrences.ts`

**Files:**
- Create: `lib/session-occurrences.ts`
- Test: `tests/session-occurrences.test.ts`

**Interfaces:**
- Consumes: `requireCoachOrAdmin` (Task 3); `OCCURRENCE_WINDOW_WEEKS`, `MAX_RIDERS_PER_SLOT`, `isValidIsoDate`, `isValidTimeOfDay`, `type SessionType` (Task 2); `requireAuthenticatedUser`, `AuthenticationError` (`lib/auth.ts`, existing).
- Produces: `class ScheduleOccurrenceError extends Error { status: number }`; `type SessionOccurrence = { id, weeklyAssignmentId, coachId, riderId, riderDisplayName, riderPlaylistUrl, sessionType, occurrenceDate, startTime, durationMinutes, status: "scheduled"|"cancelled", notes }`; `ensureOccurrencesGenerated(db, throughDate?): Promise<void>`; `listOccurrencesForCoach(db, actorId, coachId): Promise<SessionOccurrence[]>`; `listOccurrencesForRider(db, riderId): Promise<SessionOccurrence[]>`; `rescheduleOccurrence(db, { actorId, coachId, occurrenceId, occurrenceDate, startTime }): Promise<SessionOccurrence>`; `cancelOccurrence(db, actorId, coachId, occurrenceId): Promise<void>`; `handleGetMySessions(db, request): Promise<Response>`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/session-occurrences.test.ts
import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import { createWeeklyAssignment } from "@/lib/weekly-assignments";
import {
  ScheduleOccurrenceError,
  cancelOccurrence,
  ensureOccurrencesGenerated,
  listOccurrencesForCoach,
  listOccurrencesForRider,
  rescheduleOccurrence,
} from "@/lib/session-occurrences";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, display_name) VALUES (?, ?) RETURNING id",
  )
    .bind(googleSub, googleSub)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function createAdmin(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'admin')",
  )
    .bind(id)
    .run();
  return id;
}

async function createCoach(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'coach')",
  )
    .bind(id)
    .run();
  return id;
}

async function createRider(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await grantDefaultPersona(env.DB, id);
  await grantPersona(env.DB, {
    userId: id,
    persona: "theteam",
    grantedBy: await createAdmin(`${googleSub}-granter`),
  });
  return id;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("generation is idempotent: calling it twice does not duplicate rows", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });

  await ensureOccurrencesGenerated(env.DB);
  const first = await listOccurrencesForCoach(env.DB, coach, coach);
  await ensureOccurrencesGenerated(env.DB);
  const second = await listOccurrencesForCoach(env.DB, coach, coach);

  expect(second).toHaveLength(first.length);
});

test("generation produces about 8 weeks of occurrences for one assignment", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });

  const occurrences = await listOccurrencesForCoach(env.DB, coach, coach);

  expect(occurrences.length).toBeGreaterThanOrEqual(8);
  expect(occurrences.length).toBeLessThanOrEqual(9);
});

test("a rider sees their own upcoming sessions with their playlist attached", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  await env.DB.prepare(
    "INSERT INTO athlete_playlists (user_id, playlist_url) VALUES (?, 'https://open.spotify.com/playlist/abc')",
  )
    .bind(rider)
    .run();

  const sessions = await listOccurrencesForRider(env.DB, rider);

  expect(sessions.length).toBeGreaterThan(0);
  expect(sessions[0].riderPlaylistUrl).toBe(
    "https://open.spotify.com/playlist/abc",
  );
});

test("rescheduling to a free slot succeeds", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  const updated = await rescheduleOccurrence(env.DB, {
    actorId: coach,
    coachId: coach,
    occurrenceId: occurrence.id,
    occurrenceDate: occurrence.occurrenceDate,
    startTime: "20:00",
  });

  expect(updated.startTime).toBe("20:00");
});

test("rescheduling into an already-full slot is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const riderA = await createRider("sub-rider-a");
  const riderB = await createRider("sub-rider-b");
  const riderC = await createRider("sub-rider-c");
  const today = new Date().getUTCDay();

  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderA,
    sessionType: "intervals",
    dayOfWeek: today,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderB,
    sessionType: "intervals",
    dayOfWeek: today,
    startTime: "17:00",
    durationMinutes: 60,
  });
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: riderC,
    sessionType: "intervals",
    dayOfWeek: (today + 1) % 7,
    startTime: "09:00",
    durationMinutes: 60,
  });

  const occurrences = await listOccurrencesForCoach(env.DB, coach, coach);
  const occurrenceC = occurrences.find((o) => o.riderId === riderC)!;
  const fullDate = occurrences.find((o) => o.riderId === riderA)!.occurrenceDate;

  await expect(
    rescheduleOccurrence(env.DB, {
      actorId: coach,
      coachId: coach,
      occurrenceId: occurrenceC.id,
      occurrenceDate: fullDate,
      startTime: "17:00",
    }),
  ).rejects.toMatchObject({ status: 409 });
});

test("cancelling an occurrence marks it cancelled without deleting the row, and cannot be cancelled twice", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  await cancelOccurrence(env.DB, coach, coach, occurrence.id);

  const row = await env.DB.prepare(
    "SELECT status FROM session_occurrences WHERE id = ?",
  )
    .bind(occurrence.id)
    .first<{ status: string }>();
  expect(row?.status).toBe("cancelled");

  await expect(
    cancelOccurrence(env.DB, coach, coach, occurrence.id),
  ).rejects.toBeInstanceOf(ScheduleOccurrenceError);
});

test("an actor who is neither the coach nor an admin cannot reschedule or cancel an occurrence", async () => {
  const coach = await createCoach("sub-coach");
  const bystander = await createUser("sub-bystander");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: new Date().getUTCDay(),
    startTime: "17:00",
    durationMinutes: 60,
  });
  const [occurrence] = await listOccurrencesForCoach(env.DB, coach, coach);

  await expect(
    rescheduleOccurrence(env.DB, {
      actorId: bystander,
      coachId: coach,
      occurrenceId: occurrence.id,
      occurrenceDate: occurrence.occurrenceDate,
      startTime: "20:00",
    }),
  ).rejects.toMatchObject({ status: 403 });

  await expect(
    cancelOccurrence(env.DB, bystander, coach, occurrence.id),
  ).rejects.toMatchObject({ status: 403 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/session-occurrences.test.ts`
Expected: FAIL — `lib/session-occurrences` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/session-occurrences.ts
import { AuthenticationError, requireAuthenticatedUser } from "./auth";
import {
  MAX_RIDERS_PER_SLOT,
  OCCURRENCE_WINDOW_WEEKS,
  isValidIsoDate,
  isValidTimeOfDay,
  type SessionType,
} from "./coaching-constraints";
import { requireCoachOrAdmin } from "./weekly-assignments";

export class ScheduleOccurrenceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ScheduleOccurrenceError";
    this.status = status;
  }
}

export type SessionOccurrence = {
  id: number;
  weeklyAssignmentId: number;
  coachId: number;
  riderId: number;
  riderDisplayName: string | null;
  riderPlaylistUrl: string | null;
  sessionType: SessionType;
  occurrenceDate: string;
  startTime: string;
  durationMinutes: number;
  status: "scheduled" | "cancelled";
  notes: string | null;
};

type OccurrenceRow = {
  id: number;
  weekly_assignment_id: number;
  coach_id: number;
  rider_id: number;
  rider_display_name: string | null;
  playlist_url: string | null;
  session_type: string;
  occurrence_date: string;
  start_time: string;
  duration_minutes: number;
  status: "scheduled" | "cancelled";
  notes: string | null;
};

function rowToOccurrence(row: OccurrenceRow): SessionOccurrence {
  return {
    id: row.id,
    weeklyAssignmentId: row.weekly_assignment_id,
    coachId: row.coach_id,
    riderId: row.rider_id,
    riderDisplayName: row.rider_display_name,
    riderPlaylistUrl: row.playlist_url,
    sessionType: row.session_type as SessionType,
    occurrenceDate: row.occurrence_date,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    status: row.status,
    notes: row.notes,
  };
}

const OCCURRENCE_SELECT = `
  SELECT so.id, so.weekly_assignment_id, so.coach_id, so.rider_id,
         u.display_name AS rider_display_name, ap.playlist_url,
         so.session_type, so.occurrence_date, so.start_time,
         so.duration_minutes, so.status, so.notes
  FROM session_occurrences so
  JOIN users u ON u.id = so.rider_id
  LEFT JOIN athlete_playlists ap ON ap.user_id = so.rider_id
`;

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ensures dated occurrences exist for every active weekly assignment from
 * today through `throughDate` (inclusive). Safe to call on every schedule
 * read: `INSERT ... WHERE NOT EXISTS` leaves already-generated dates alone.
 */
export async function ensureOccurrencesGenerated(
  db: D1Database,
  throughDate: string = addDaysIso(todayIso(), OCCURRENCE_WINDOW_WEEKS * 7),
): Promise<void> {
  const { results: assignments } = await db
    .prepare(
      `SELECT id, coach_id, rider_id, session_type, day_of_week, start_time, duration_minutes
       FROM weekly_assignments WHERE active = 1`,
    )
    .all<{
      id: number;
      coach_id: number;
      rider_id: number;
      session_type: string;
      day_of_week: number;
      start_time: string;
      duration_minutes: number;
    }>();

  if (assignments.length === 0) return;

  const start = todayIso();
  const statements: D1PreparedStatement[] = [];

  for (const assignment of assignments) {
    const cursorDay = new Date(`${start}T00:00:00Z`).getUTCDay();
    const daysUntil = (assignment.day_of_week - cursorDay + 7) % 7;
    let cursor = addDaysIso(start, daysUntil);

    while (cursor <= throughDate) {
      statements.push(
        db
          .prepare(
            `INSERT INTO session_occurrences
               (weekly_assignment_id, coach_id, rider_id, session_type,
                occurrence_date, start_time, duration_minutes)
             SELECT ?, ?, ?, ?, ?, ?, ?
             WHERE NOT EXISTS (
               SELECT 1 FROM session_occurrences
               WHERE weekly_assignment_id = ? AND occurrence_date = ?
             )`,
          )
          .bind(
            assignment.id,
            assignment.coach_id,
            assignment.rider_id,
            assignment.session_type,
            cursor,
            assignment.start_time,
            assignment.duration_minutes,
            assignment.id,
            cursor,
          ),
      );
      cursor = addDaysIso(cursor, 7);
    }
  }

  if (statements.length > 0) await db.batch(statements);
}

export async function listOccurrencesForCoach(
  db: D1Database,
  actorId: number,
  coachId: number,
): Promise<SessionOccurrence[]> {
  await requireCoachOrAdmin(db, actorId, coachId);
  await ensureOccurrencesGenerated(db);

  const { results } = await db
    .prepare(
      `${OCCURRENCE_SELECT}
       WHERE so.coach_id = ? AND so.occurrence_date >= date('now')
       ORDER BY so.occurrence_date, so.start_time, so.id`,
    )
    .bind(coachId)
    .all<OccurrenceRow>();

  return results.map(rowToOccurrence);
}

export async function listOccurrencesForRider(
  db: D1Database,
  riderId: number,
): Promise<SessionOccurrence[]> {
  await ensureOccurrencesGenerated(db);

  const { results } = await db
    .prepare(
      `${OCCURRENCE_SELECT}
       WHERE so.rider_id = ? AND so.occurrence_date >= date('now')
       ORDER BY so.occurrence_date, so.start_time, so.id`,
    )
    .bind(riderId)
    .all<OccurrenceRow>();

  return results.map(rowToOccurrence);
}

type RescheduleOccurrenceInput = {
  actorId: number;
  coachId: number;
  occurrenceId: number;
  occurrenceDate: string;
  startTime: string;
};

export async function rescheduleOccurrence(
  db: D1Database,
  input: RescheduleOccurrenceInput,
): Promise<SessionOccurrence> {
  const { actorId, coachId, occurrenceId, occurrenceDate, startTime } = input;
  await requireCoachOrAdmin(db, actorId, coachId);

  if (!isValidIsoDate(occurrenceDate)) {
    throw new ScheduleOccurrenceError(
      "occurrence_date must be YYYY-MM-DD",
      400,
    );
  }
  if (!isValidTimeOfDay(startTime)) {
    throw new ScheduleOccurrenceError("start_time must be HH:MM", 400);
  }

  const existing = await db
    .prepare(
      `SELECT id, session_type FROM session_occurrences
       WHERE id = ? AND coach_id = ? AND status = 'scheduled'`,
    )
    .bind(occurrenceId, coachId)
    .first<{ id: number; session_type: string }>();

  if (!existing) {
    throw new ScheduleOccurrenceError("occurrence not found", 404);
  }

  const collision = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM session_occurrences
       WHERE coach_id = ? AND session_type = ? AND occurrence_date = ?
         AND start_time = ? AND status = 'scheduled' AND id != ?`,
    )
    .bind(coachId, existing.session_type, occurrenceDate, startTime, occurrenceId)
    .first<{ n: number }>();

  if ((collision?.n ?? 0) >= MAX_RIDERS_PER_SLOT) {
    throw new ScheduleOccurrenceError(
      "that date and time already has two riders scheduled",
      409,
    );
  }

  await db
    .prepare(
      `UPDATE session_occurrences
       SET occurrence_date = ?, start_time = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(occurrenceDate, startTime, occurrenceId)
    .run();

  const updated = await db
    .prepare(`${OCCURRENCE_SELECT} WHERE so.id = ?`)
    .bind(occurrenceId)
    .first<OccurrenceRow>();

  return rowToOccurrence(updated!);
}

export async function cancelOccurrence(
  db: D1Database,
  actorId: number,
  coachId: number,
  occurrenceId: number,
): Promise<void> {
  await requireCoachOrAdmin(db, actorId, coachId);

  const result = await db
    .prepare(
      `UPDATE session_occurrences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND coach_id = ? AND status = 'scheduled'`,
    )
    .bind(occurrenceId, coachId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new ScheduleOccurrenceError("occurrence not found", 404);
  }
}

const PRIVATE_NO_STORE = "private, no-store";

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

/** HTTP behavior for GET /api/me/sessions. */
export async function handleGetMySessions(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    return privateJson({ sessions: await listOccurrencesForRider(db, userId) });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return privateJson({ error: error.message }, error.status);
    }
    throw error;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/session-occurrences.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/session-occurrences.ts tests/session-occurrences.test.ts
git commit -m "feat: generate and manage dated session occurrences"
```

---

### Task 5: `lib/athlete-ftp.ts`

**Files:**
- Create: `lib/athlete-ftp.ts`
- Test: `tests/athlete-ftp.test.ts`

**Interfaces:**
- Consumes: `requireCoachOrAdmin` (Task 3); `isValidFtpWatts`, `isValidSessionType`, `type SessionType` (Task 2).
- Produces: `class FtpZoneError extends Error { status: number }`; `type FtpZones = { userId, sessionType, z1Watts, z2Watts, z3Watts, z4Watts, z5Watts, updatedAt }`; `getFtpZones(db, actorId, coachId, riderId, sessionType): Promise<FtpZones>`; `setFtpZones(db, { actorId, coachId, riderId, sessionType, z1Watts, z2Watts, z3Watts, z4Watts, z5Watts }): Promise<FtpZones>`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/athlete-ftp.test.ts
import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { FtpZoneError, getFtpZones, setFtpZones } from "@/lib/athlete-ftp";
import { grantDefaultPersona, grantPersona } from "@/lib/personas";
import { createWeeklyAssignment } from "@/lib/weekly-assignments";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub, display_name) VALUES (?, ?) RETURNING id",
  )
    .bind(googleSub, googleSub)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");
  return row.id;
}

async function createAdmin(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'admin')",
  )
    .bind(id)
    .run();
  return id;
}

async function createCoach(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await env.DB.prepare(
    "INSERT INTO user_personas (user_id, persona_key) VALUES (?, 'coach')",
  )
    .bind(id)
    .run();
  return id;
}

async function createRider(googleSub: string): Promise<number> {
  const id = await createUser(googleSub);
  await grantDefaultPersona(env.DB, id);
  await grantPersona(env.DB, {
    userId: id,
    persona: "theteam",
    grantedBy: await createAdmin(`${googleSub}-granter`),
  });
  return id;
}

const ZONES = { z1Watts: 100, z2Watts: 140, z3Watts: 170, z4Watts: 200, z5Watts: 240 };

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("a coach can set and read FTP zones for a rider they actively coach", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  await setFtpZones(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    ...ZONES,
  });

  const zones = await getFtpZones(env.DB, coach, coach, rider, "intervals");
  expect(zones).toMatchObject({ z1Watts: 100, z5Watts: 240 });
});

test("setting FTP zones without an active assignment is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");

  await expect(
    setFtpZones(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: rider,
      sessionType: "intervals",
      ...ZONES,
    }),
  ).rejects.toMatchObject({ status: 409 });
});

test("an invalid watt value is rejected", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  await expect(
    setFtpZones(env.DB, {
      actorId: coach,
      coachId: coach,
      riderId: rider,
      sessionType: "intervals",
      ...ZONES,
      z1Watts: 0,
    }),
  ).rejects.toBeInstanceOf(FtpZoneError);
});

test("reading zones for a rider with none set yet returns nulls, not an error", async () => {
  const coach = await createCoach("sub-coach");
  const rider = await createRider("sub-rider");

  const zones = await getFtpZones(env.DB, coach, coach, rider, "intervals");
  expect(zones.z1Watts).toBeNull();
});

test("a different coach cannot set zones for a rider they do not coach", async () => {
  const coachA = await createCoach("sub-coach-a");
  const coachB = await createCoach("sub-coach-b");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coachA,
    coachId: coachA,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  await expect(
    setFtpZones(env.DB, {
      actorId: coachB,
      coachId: coachB,
      riderId: rider,
      sessionType: "intervals",
      ...ZONES,
    }),
  ).rejects.toMatchObject({ status: 409 });
});

test("an actor who is neither the coach nor an admin cannot read or set FTP zones", async () => {
  const coach = await createCoach("sub-coach");
  const bystander = await createUser("sub-bystander");
  const rider = await createRider("sub-rider");
  await createWeeklyAssignment(env.DB, {
    actorId: coach,
    coachId: coach,
    riderId: rider,
    sessionType: "intervals",
    dayOfWeek: 2,
    startTime: "17:00",
    durationMinutes: 60,
  });

  await expect(
    getFtpZones(env.DB, bystander, coach, rider, "intervals"),
  ).rejects.toMatchObject({ status: 403 });

  await expect(
    setFtpZones(env.DB, {
      actorId: bystander,
      coachId: coach,
      riderId: rider,
      sessionType: "intervals",
      ...ZONES,
    }),
  ).rejects.toMatchObject({ status: 403 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/athlete-ftp.test.ts`
Expected: FAIL — `lib/athlete-ftp` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/athlete-ftp.ts
import { isValidFtpWatts, isValidSessionType, type SessionType } from "./coaching-constraints";
import { requireCoachOrAdmin } from "./weekly-assignments";

export class FtpZoneError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FtpZoneError";
    this.status = status;
  }
}

export type FtpZones = {
  userId: number;
  sessionType: SessionType;
  z1Watts: number | null;
  z2Watts: number | null;
  z3Watts: number | null;
  z4Watts: number | null;
  z5Watts: number | null;
  updatedAt: string | null;
};

export async function getFtpZones(
  db: D1Database,
  actorId: number,
  coachId: number,
  riderId: number,
  sessionType: string,
): Promise<FtpZones> {
  await requireCoachOrAdmin(db, actorId, coachId);
  if (!isValidSessionType(sessionType)) {
    throw new FtpZoneError("unknown session type", 400);
  }

  const row = await db
    .prepare(
      `SELECT user_id, session_type, z1_watts, z2_watts, z3_watts, z4_watts, z5_watts, updated_at
       FROM athlete_ftp_zones WHERE user_id = ? AND session_type = ?`,
    )
    .bind(riderId, sessionType)
    .first<{
      user_id: number;
      session_type: string;
      z1_watts: number | null;
      z2_watts: number | null;
      z3_watts: number | null;
      z4_watts: number | null;
      z5_watts: number | null;
      updated_at: string;
    }>();

  if (!row) {
    return {
      userId: riderId,
      sessionType: sessionType as SessionType,
      z1Watts: null,
      z2Watts: null,
      z3Watts: null,
      z4Watts: null,
      z5Watts: null,
      updatedAt: null,
    };
  }

  return {
    userId: row.user_id,
    sessionType: row.session_type as SessionType,
    z1Watts: row.z1_watts,
    z2Watts: row.z2_watts,
    z3Watts: row.z3_watts,
    z4Watts: row.z4_watts,
    z5Watts: row.z5_watts,
    updatedAt: row.updated_at,
  };
}

type SetFtpZonesInput = {
  actorId: number;
  coachId: number;
  riderId: number;
  sessionType: string;
  z1Watts: number;
  z2Watts: number;
  z3Watts: number;
  z4Watts: number;
  z5Watts: number;
};

export async function setFtpZones(
  db: D1Database,
  input: SetFtpZonesInput,
): Promise<FtpZones> {
  const {
    actorId,
    coachId,
    riderId,
    sessionType,
    z1Watts,
    z2Watts,
    z3Watts,
    z4Watts,
    z5Watts,
  } = input;
  await requireCoachOrAdmin(db, actorId, coachId);

  if (!isValidSessionType(sessionType)) {
    throw new FtpZoneError("unknown session type", 400);
  }
  for (const watts of [z1Watts, z2Watts, z3Watts, z4Watts, z5Watts]) {
    if (!isValidFtpWatts(watts)) {
      throw new FtpZoneError(
        "each zone must be a whole watt value between 1 and 3000",
        400,
      );
    }
  }

  const activeAssignment = await db
    .prepare(
      `SELECT 1 FROM weekly_assignments
       WHERE coach_id = ? AND rider_id = ? AND session_type = ? AND active = 1`,
    )
    .bind(coachId, riderId, sessionType)
    .first();

  if (!activeAssignment) {
    throw new FtpZoneError(
      "the rider has no active weekly assignment with this coach for this session type",
      409,
    );
  }

  await db
    .prepare(
      `INSERT INTO athlete_ftp_zones
         (user_id, session_type, z1_watts, z2_watts, z3_watts, z4_watts, z5_watts, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, session_type) DO UPDATE SET
         z1_watts = excluded.z1_watts,
         z2_watts = excluded.z2_watts,
         z3_watts = excluded.z3_watts,
         z4_watts = excluded.z4_watts,
         z5_watts = excluded.z5_watts,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = excluded.updated_by`,
    )
    .bind(riderId, sessionType, z1Watts, z2Watts, z3Watts, z4Watts, z5Watts, actorId)
    .run();

  return getFtpZones(db, actorId, coachId, riderId, sessionType);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/athlete-ftp.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/athlete-ftp.ts tests/athlete-ftp.test.ts
git commit -m "feat: add coach-entered FTP zone tracking per rider"
```

---

### Task 6: `lib/athlete-playlist.ts`

**Files:**
- Create: `lib/athlete-playlist.ts`
- Test: `tests/athlete-playlist.test.ts`

**Interfaces:**
- Consumes: `requireAuthenticatedUser`, `AuthenticationError` (`lib/auth.ts`, existing).
- Produces: `class PlaylistError extends Error { status: number }`; `type Playlist = { playlistUrl: string | null }`; `getPlaylist(db, userId): Promise<Playlist>`; `setPlaylist(db, userId, playlistUrl: unknown): Promise<Playlist>`; `handleGetPlaylist(db, request): Promise<Response>`; `handlePutPlaylist(db, request): Promise<Response>`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/athlete-playlist.test.ts
import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { PlaylistError, getPlaylist, setPlaylist } from "@/lib/athlete-playlist";

async function createUser(googleSub: string): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (google_sub) VALUES (?) RETURNING id",
  )
    .bind(googleSub)
    .first<{ id: number }>();
  if (!row) throw new Error("failed to seed user");
  return row.id;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM users").run();
});

test("a user can set and read their own playlist URL", async () => {
  const userId = await createUser("sub-rider");

  await setPlaylist(env.DB, userId, "https://open.spotify.com/playlist/abc");

  expect(await getPlaylist(env.DB, userId)).toEqual({
    playlistUrl: "https://open.spotify.com/playlist/abc",
  });
});

test("an empty string clears the playlist", async () => {
  const userId = await createUser("sub-rider");
  await setPlaylist(env.DB, userId, "https://open.spotify.com/playlist/abc");

  await setPlaylist(env.DB, userId, "");

  expect(await getPlaylist(env.DB, userId)).toEqual({ playlistUrl: null });
});

test("a non-https URL is rejected", async () => {
  const userId = await createUser("sub-rider");

  await expect(
    setPlaylist(env.DB, userId, "http://example.com/playlist"),
  ).rejects.toBeInstanceOf(PlaylistError);
});

test("a value that is not a URL at all is rejected", async () => {
  const userId = await createUser("sub-rider");

  await expect(setPlaylist(env.DB, userId, "not a url")).rejects.toBeInstanceOf(
    PlaylistError,
  );
});

test("reading a playlist that was never set returns null, not an error", async () => {
  const userId = await createUser("sub-rider");

  expect(await getPlaylist(env.DB, userId)).toEqual({ playlistUrl: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/athlete-playlist.test.ts`
Expected: FAIL — `lib/athlete-playlist` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/athlete-playlist.ts
import { AuthenticationError, requireAuthenticatedUser } from "./auth";

export class PlaylistError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PlaylistError";
    this.status = status;
  }
}

const MAX_PLAYLIST_URL_CHARACTERS = 300;
const PRIVATE_NO_STORE = "private, no-store";

export type Playlist = { playlistUrl: string | null };

export async function getPlaylist(
  db: D1Database,
  userId: number,
): Promise<Playlist> {
  const row = await db
    .prepare("SELECT playlist_url FROM athlete_playlists WHERE user_id = ?")
    .bind(userId)
    .first<{ playlist_url: string | null }>();

  return { playlistUrl: row?.playlist_url ?? null };
}

function validatePlaylistUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new PlaylistError("playlist_url must be a string or null", 400);
  }

  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_PLAYLIST_URL_CHARACTERS) {
    throw new PlaylistError("playlist_url is too long", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PlaylistError("playlist_url must be a valid URL", 400);
  }
  if (parsed.protocol !== "https:") {
    throw new PlaylistError("playlist_url must use https", 400);
  }

  return trimmed;
}

export async function setPlaylist(
  db: D1Database,
  userId: number,
  playlistUrl: unknown,
): Promise<Playlist> {
  const validated = validatePlaylistUrl(playlistUrl);

  await db
    .prepare(
      `INSERT INTO athlete_playlists (user_id, playlist_url) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         playlist_url = excluded.playlist_url, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userId, validated)
    .run();

  return { playlistUrl: validated };
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

function errorResponse(error: unknown): Response | null {
  if (error instanceof AuthenticationError || error instanceof PlaylistError) {
    return privateJson({ error: error.message }, error.status);
  }
  return null;
}

/** HTTP behavior for GET /api/me/playlist. */
export async function handleGetPlaylist(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);
    return privateJson(await getPlaylist(db, userId));
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** HTTP behavior for PUT /api/me/playlist. */
export async function handlePutPlaylist(
  db: D1Database,
  request: Request,
): Promise<Response> {
  try {
    const userId = await requireAuthenticatedUser(db, request);

    let body: { playlistUrl?: unknown };
    try {
      body = (await request.json()) as { playlistUrl?: unknown };
    } catch {
      throw new PlaylistError("request body must be valid JSON", 400);
    }

    return privateJson(await setPlaylist(db, userId, body.playlistUrl ?? null));
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/athlete-playlist.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/athlete-playlist.ts tests/athlete-playlist.test.ts
git commit -m "feat: add rider self-service playlist link"
```

---

### Task 7: Coach schedule API routes (assignments + occurrences)

**Files:**
- Create: `app/api/coaches/[coachId]/schedule/route.ts`
- Create: `app/api/coaches/[coachId]/schedule/[assignmentId]/route.ts`
- Create: `app/api/coaches/[coachId]/occurrences/[occurrenceId]/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 3-4 (`createWeeklyAssignment`, `listWeeklyAssignmentsForCoach`, `deactivateWeeklyAssignment`, `listSchedulableRiders`, `ScheduleAssignmentError`, `ensureOccurrencesGenerated`, `listOccurrencesForCoach`, `rescheduleOccurrence`, `cancelOccurrence`, `ScheduleOccurrenceError`); `requireAuthenticatedUser`, `AuthenticationError` (`lib/auth.ts`); `secureApiResponse`, `handleApiOptions`, `rateLimitResponse` (`lib/api-security.ts`); `getDb`, `getAppRuntime` (`lib/db.ts`).
- Produces: the three routes consumed by Task 9's `CoachScheduleManager` and Task 10's pages. No automated test — per the Global Constraints, param-based routes are verified manually (route files call `getCloudflareContext()`, unavailable under the Vitest pool, matching `app/api/admin/users/[id]/personas/route.ts`).

- [ ] **Step 1: Write the routes**

```typescript
// app/api/coaches/[coachId]/schedule/route.ts
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { getAppRuntime, getDb } from "@/lib/db";
import {
  ensureOccurrencesGenerated,
  listOccurrencesForCoach,
  ScheduleOccurrenceError,
} from "@/lib/session-occurrences";
import {
  createWeeklyAssignment,
  listSchedulableRiders,
  listWeeklyAssignmentsForCoach,
  ScheduleAssignmentError,
} from "@/lib/weekly-assignments";

export const dynamic = "force-dynamic";

function parseCoachId(id: string): number {
  const coachId = Number(id);
  if (!Number.isInteger(coachId) || coachId <= 0) {
    throw new ScheduleAssignmentError("invalid coach id", 400);
  }
  return coachId;
}

function errorResponse(error: unknown): Response | null {
  if (
    error instanceof AuthenticationError ||
    error instanceof ScheduleAssignmentError ||
    error instanceof ScheduleOccurrenceError
  ) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}

async function getSchedule(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule">,
) {
  try {
    const db = await getDb();
    const actorId = await requireAuthenticatedUser(db, request);
    const { coachId } = await ctx.params;
    const id = parseCoachId(coachId);

    const assignments = await listWeeklyAssignmentsForCoach(db, actorId, id);
    await ensureOccurrencesGenerated(db);
    const occurrences = await listOccurrencesForCoach(db, actorId, id);
    const eligibleRiders = await listSchedulableRiders(db);

    return Response.json(
      { assignments, occurrences, eligibleRiders },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

type CreateAssignmentBody = {
  riderId?: unknown;
  sessionType?: unknown;
  dayOfWeek?: unknown;
  startTime?: unknown;
  durationMinutes?: unknown;
};

async function postSchedule(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule">,
) {
  const { db, rateLimiters } = await getAppRuntime();
  try {
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "coach-schedule-write",
      60,
    );
    if (limited) return limited;

    const actorId = await requireAuthenticatedUser(db, request);
    const { coachId } = await ctx.params;
    const id = parseCoachId(coachId);

    let body: CreateAssignmentBody;
    try {
      body = (await request.json()) as CreateAssignmentBody;
    } catch {
      throw new ScheduleAssignmentError("expected a JSON body", 400);
    }

    if (typeof body.riderId !== "number") {
      throw new ScheduleAssignmentError("riderId is required", 400);
    }
    if (typeof body.sessionType !== "string") {
      throw new ScheduleAssignmentError("sessionType is required", 400);
    }
    if (typeof body.dayOfWeek !== "number") {
      throw new ScheduleAssignmentError("dayOfWeek is required", 400);
    }
    if (typeof body.startTime !== "string") {
      throw new ScheduleAssignmentError("startTime is required", 400);
    }
    const durationMinutes =
      typeof body.durationMinutes === "number" ? body.durationMinutes : 60;

    const assignment = await createWeeklyAssignment(db, {
      actorId,
      coachId: id,
      riderId: body.riderId,
      sessionType: body.sessionType,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      durationMinutes,
    });

    return Response.json(assignment, { status: 201 });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

export function GET(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule">,
) {
  return secureApiResponse(request, () => getSchedule(request, ctx));
}

export function POST(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule">,
) {
  return secureApiResponse(request, () => postSchedule(request, ctx));
}

export { handleApiOptions as OPTIONS };
```

```typescript
// app/api/coaches/[coachId]/schedule/[assignmentId]/route.ts
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { getAppRuntime } from "@/lib/db";
import {
  deactivateWeeklyAssignment,
  ScheduleAssignmentError,
} from "@/lib/weekly-assignments";

export const dynamic = "force-dynamic";

async function deleteAssignment(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule/[assignmentId]">,
) {
  const { db, rateLimiters } = await getAppRuntime();
  try {
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "coach-schedule-write",
      60,
    );
    if (limited) return limited;

    const actorId = await requireAuthenticatedUser(db, request);
    const { coachId, assignmentId } = await ctx.params;
    const coach = Number(coachId);
    const assignment = Number(assignmentId);
    if (
      !Number.isInteger(coach) ||
      coach <= 0 ||
      !Number.isInteger(assignment) ||
      assignment <= 0
    ) {
      throw new ScheduleAssignmentError("invalid id", 400);
    }

    await deactivateWeeklyAssignment(db, actorId, coach, assignment);
    return Response.json({ ok: true });
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof ScheduleAssignmentError
    ) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export function DELETE(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/schedule/[assignmentId]">,
) {
  return secureApiResponse(request, () => deleteAssignment(request, ctx));
}

export { handleApiOptions as OPTIONS };
```

```typescript
// app/api/coaches/[coachId]/occurrences/[occurrenceId]/route.ts
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { getAppRuntime } from "@/lib/db";
import {
  cancelOccurrence,
  rescheduleOccurrence,
  ScheduleOccurrenceError,
} from "@/lib/session-occurrences";

export const dynamic = "force-dynamic";

type PatchBody = {
  action?: unknown;
  occurrenceDate?: unknown;
  startTime?: unknown;
};

async function patchOccurrence(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/occurrences/[occurrenceId]">,
) {
  const { db, rateLimiters } = await getAppRuntime();
  try {
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "coach-schedule-write",
      60,
    );
    if (limited) return limited;

    const actorId = await requireAuthenticatedUser(db, request);
    const { coachId, occurrenceId } = await ctx.params;
    const coach = Number(coachId);
    const occurrence = Number(occurrenceId);
    if (
      !Number.isInteger(coach) ||
      coach <= 0 ||
      !Number.isInteger(occurrence) ||
      occurrence <= 0
    ) {
      throw new ScheduleOccurrenceError("invalid id", 400);
    }

    let body: PatchBody;
    try {
      body = (await request.json()) as PatchBody;
    } catch {
      throw new ScheduleOccurrenceError("expected a JSON body", 400);
    }

    if (body.action === "cancel") {
      await cancelOccurrence(db, actorId, coach, occurrence);
      return Response.json({ ok: true });
    }

    if (body.action === "reschedule") {
      if (
        typeof body.occurrenceDate !== "string" ||
        typeof body.startTime !== "string"
      ) {
        throw new ScheduleOccurrenceError(
          "occurrenceDate and startTime are required to reschedule",
          400,
        );
      }
      const updated = await rescheduleOccurrence(db, {
        actorId,
        coachId: coach,
        occurrenceId: occurrence,
        occurrenceDate: body.occurrenceDate,
        startTime: body.startTime,
      });
      return Response.json(updated);
    }

    throw new ScheduleOccurrenceError(
      "action must be cancel or reschedule",
      400,
    );
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof ScheduleOccurrenceError
    ) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export function PATCH(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/occurrences/[occurrenceId]">,
) {
  return secureApiResponse(request, () => patchOccurrence(request, ctx));
}

export { handleApiOptions as OPTIONS };
```

- [ ] **Step 2: Verify manually against the dev server**

Run: `nvm use && npm run db:migrate:local && npm run dev`

In a second terminal, sign in through the browser at `http://localhost:3000`, open dev tools, copy the `rad_session` cookie value, then (replacing `<cookie>`, and using your own signed-in user id as both the coach id and, for now, testing as admin/self):

```bash
curl -s http://localhost:3000/api/coaches/<your-user-id>/schedule \
  -H "Cookie: rad_session=<cookie>" \
  -H "Origin: http://localhost:3000" | jq
```

Expected: `200` with `{"assignments":[],"occurrences":[],"eligibleRiders":[...]}`.

```bash
curl -s -X POST http://localhost:3000/api/coaches/<your-user-id>/schedule \
  -H "Cookie: rad_session=<cookie>" -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"riderId": <a theteam user id>, "sessionType": "intervals", "dayOfWeek": 2, "startTime": "17:00"}' | jq
```

Expected: `201` with the created assignment if that rider holds `theteam`; `400` naming the missing persona otherwise. Re-run `GET` and confirm `occurrences` now has ~8 rows, then `DELETE /api/coaches/<coachId>/schedule/<assignmentId>` and `PATCH /api/coaches/<coachId>/occurrences/<occurrenceId>` with `{"action":"cancel"}` and confirm both succeed.

- [ ] **Step 3: Commit**

```bash
git add app/api/coaches
git commit -m "feat: add coach schedule and occurrence API routes"
```

---

### Task 8: FTP, `/api/me/sessions`, and `/api/me/playlist` routes

**Files:**
- Create: `app/api/coaches/[coachId]/riders/[riderId]/ftp/route.ts`
- Create: `app/api/me/sessions/route.ts`
- Create: `app/api/me/playlist/route.ts`

**Interfaces:**
- Consumes: `getFtpZones`, `setFtpZones`, `FtpZoneError` (Task 5); `handleGetMySessions` (Task 4); `handleGetPlaylist`, `handlePutPlaylist` (Task 6); `SESSION_TYPES` (Task 2); `requireAuthenticatedUser`, `AuthenticationError`; `secureApiResponse`, `handleApiOptions`, `rateLimitResponse`; `getDb`, `getAppRuntime`.
- Produces: the three routes consumed by Task 9 (FTP) and Tasks 10-11 (sessions/playlist). No automated test, per Global Constraints.

- [ ] **Step 1: Write the routes**

```typescript
// app/api/coaches/[coachId]/riders/[riderId]/ftp/route.ts
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/auth";
import { FtpZoneError, getFtpZones, setFtpZones } from "@/lib/athlete-ftp";
import { SESSION_TYPES } from "@/lib/coaching-constraints";
import { getAppRuntime, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseIds(
  coachId: string,
  riderId: string,
): { coach: number; rider: number } {
  const coach = Number(coachId);
  const rider = Number(riderId);
  if (
    !Number.isInteger(coach) ||
    coach <= 0 ||
    !Number.isInteger(rider) ||
    rider <= 0
  ) {
    throw new FtpZoneError("invalid id", 400);
  }
  return { coach, rider };
}

function sessionTypeParam(request: Request): string {
  return new URL(request.url).searchParams.get("sessionType") ?? SESSION_TYPES[0];
}

function errorResponse(error: unknown): Response | null {
  if (error instanceof AuthenticationError || error instanceof FtpZoneError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}

async function getFtp(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/riders/[riderId]/ftp">,
) {
  try {
    const db = await getDb();
    const actorId = await requireAuthenticatedUser(db, request);
    const { coachId, riderId } = await ctx.params;
    const { coach, rider } = parseIds(coachId, riderId);

    const zones = await getFtpZones(
      db,
      actorId,
      coach,
      rider,
      sessionTypeParam(request),
    );
    return Response.json(zones, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

type PutFtpBody = {
  sessionType?: unknown;
  z1Watts?: unknown;
  z2Watts?: unknown;
  z3Watts?: unknown;
  z4Watts?: unknown;
  z5Watts?: unknown;
};

async function putFtp(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/riders/[riderId]/ftp">,
) {
  const { db, rateLimiters } = await getAppRuntime();
  try {
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "coach-schedule-write",
      60,
    );
    if (limited) return limited;

    const actorId = await requireAuthenticatedUser(db, request);
    const { coachId, riderId } = await ctx.params;
    const { coach, rider } = parseIds(coachId, riderId);

    let body: PutFtpBody;
    try {
      body = (await request.json()) as PutFtpBody;
    } catch {
      throw new FtpZoneError("expected a JSON body", 400);
    }

    for (const key of [
      "z1Watts",
      "z2Watts",
      "z3Watts",
      "z4Watts",
      "z5Watts",
    ] as const) {
      if (typeof body[key] !== "number") {
        throw new FtpZoneError(`${key} is required`, 400);
      }
    }

    const zones = await setFtpZones(db, {
      actorId,
      coachId: coach,
      riderId: rider,
      sessionType:
        typeof body.sessionType === "string" ? body.sessionType : SESSION_TYPES[0],
      z1Watts: body.z1Watts as number,
      z2Watts: body.z2Watts as number,
      z3Watts: body.z3Watts as number,
      z4Watts: body.z4Watts as number,
      z5Watts: body.z5Watts as number,
    });

    return Response.json(zones);
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

export function GET(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/riders/[riderId]/ftp">,
) {
  return secureApiResponse(request, () => getFtp(request, ctx));
}

export function PUT(
  request: Request,
  ctx: RouteContext<"/api/coaches/[coachId]/riders/[riderId]/ftp">,
) {
  return secureApiResponse(request, () => putFtp(request, ctx));
}

export { handleApiOptions as OPTIONS };
```

```typescript
// app/api/me/sessions/route.ts
import {
  handleApiOptions,
  secureApiResponse,
} from "@/lib/api-security";
import { getDb } from "@/lib/db";
import { handleGetMySessions } from "@/lib/session-occurrences";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () =>
    handleGetMySessions(await getDb(), request),
  );
}

export { handleApiOptions as OPTIONS };
```

```typescript
// app/api/me/playlist/route.ts
import {
  handleApiOptions,
  rateLimitResponse,
  secureApiResponse,
} from "@/lib/api-security";
import { handleGetPlaylist, handlePutPlaylist } from "@/lib/athlete-playlist";
import { getAppRuntime, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return secureApiResponse(request, async () =>
    handleGetPlaylist(await getDb(), request),
  );
}

export async function PUT(request: Request) {
  return secureApiResponse(request, async () => {
    const { db, rateLimiters } = await getAppRuntime();
    const limited = await rateLimitResponse(
      request,
      rateLimiters.write,
      "playlist-write",
      60,
    );
    return limited ?? handlePutPlaylist(db, request);
  });
}

export { handleApiOptions as OPTIONS };
```

- [ ] **Step 2: Verify manually against the dev server**

With `npm run dev` still running and the same `rad_session` cookie:

```bash
curl -s -X PUT http://localhost:3000/api/me/playlist \
  -H "Cookie: rad_session=<cookie>" -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"playlistUrl": "https://open.spotify.com/playlist/abc"}' | jq
```

Expected: `200` with `{"playlistUrl":"https://open.spotify.com/playlist/abc"}`.

```bash
curl -s http://localhost:3000/api/me/sessions \
  -H "Cookie: rad_session=<cookie>" -H "Origin: http://localhost:3000" | jq
```

Expected: `200` with `{"sessions":[...]}` (populated if you created an assignment for this user in Task 7's check).

```bash
curl -s -X PUT "http://localhost:3000/api/coaches/<coachId>/riders/<riderId>/ftp" \
  -H "Cookie: rad_session=<cookie>" -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"z1Watts":100,"z2Watts":140,"z3Watts":170,"z4Watts":200,"z5Watts":240}' | jq
```

Expected: `200` with the saved zones if the rider has an active assignment with that coach; `409` otherwise.

- [ ] **Step 3: Commit**

```bash
git add app/api/coaches/[coachId]/riders app/api/me
git commit -m "feat: add FTP zone, my-sessions, and playlist API routes"
```

---

### Task 9: `CoachScheduleManager.tsx`

**Files:**
- Create: `app/coach/CoachScheduleManager.tsx`
- Test: `tests/coach-schedule-ui.test.ts`

**Interfaces:**
- Consumes: `type WeeklyAssignment` (Task 3), `type SessionOccurrence` (Task 4), `type FtpZones` (Task 5), `DAYS_OF_WEEK`, `SESSION_TYPES` (Task 2); calls the routes from Tasks 7-8 via `fetch`.
- Produces: `export default function CoachScheduleManager({ coachId, initialAssignments, initialOccurrences, eligibleRiders })` — a client component, consumed by Task 10's `app/coach/page.tsx` and `app/admin/coaches/[id]/page.tsx`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach-schedule-ui.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import CoachScheduleManager from "@/app/coach/CoachScheduleManager";
import type { SessionOccurrence } from "@/lib/session-occurrences";
import type { WeeklyAssignment } from "@/lib/weekly-assignments";

const ASSIGNMENT: WeeklyAssignment = {
  id: 1,
  coachId: 10,
  riderId: 20,
  riderDisplayName: "Alice Rider",
  sessionType: "intervals",
  dayOfWeek: 2,
  startTime: "17:00",
  durationMinutes: 60,
};

const OCCURRENCE: SessionOccurrence = {
  id: 100,
  weeklyAssignmentId: 1,
  coachId: 10,
  riderId: 20,
  riderDisplayName: "Alice Rider",
  riderPlaylistUrl: "https://open.spotify.com/playlist/abc",
  sessionType: "intervals",
  occurrenceDate: "2026-08-25",
  startTime: "17:00",
  durationMinutes: 60,
  status: "scheduled",
  notes: null,
};

test("shows the weekly assignment, the add-rider form, and upcoming sessions with a playlist link", () => {
  const html = renderToStaticMarkup(
    createElement(CoachScheduleManager, {
      coachId: 10,
      initialAssignments: [ASSIGNMENT],
      initialOccurrences: [OCCURRENCE],
      eligibleRiders: [{ id: 20, displayName: "Alice Rider" }],
    }),
  );

  expect(html).toContain("Alice Rider");
  expect(html).toContain("Tuesday");
  expect(html).toContain("Add to calendar");
  expect(html).toContain("2026-08-25");
  expect(html).toContain('href="https://open.spotify.com/playlist/abc"');
  expect(html).toContain("Cancel this date");
  expect(html).toContain("Reschedule");
});

test("shows an empty state when there is nothing scheduled yet", () => {
  const html = renderToStaticMarkup(
    createElement(CoachScheduleManager, {
      coachId: 10,
      initialAssignments: [],
      initialOccurrences: [],
      eligibleRiders: [],
    }),
  );

  expect(html).toContain("No riders scheduled yet.");
  expect(html).toContain("No upcoming sessions.");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach-schedule-ui.test.ts`
Expected: FAIL — `app/coach/CoachScheduleManager` not found.

- [ ] **Step 3: Write the implementation**

```tsx
// app/coach/CoachScheduleManager.tsx
"use client";

import { useState, type FormEvent } from "react";
import type { FtpZones } from "@/lib/athlete-ftp";
import { DAYS_OF_WEEK, SESSION_TYPES } from "@/lib/coaching-constraints";
import type { SessionOccurrence } from "@/lib/session-occurrences";
import type { WeeklyAssignment } from "@/lib/weekly-assignments";

type Rider = { id: number; displayName: string | null };

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "That change could not be saved.";
}

export default function CoachScheduleManager({
  coachId,
  initialAssignments,
  initialOccurrences,
  eligibleRiders,
}: {
  coachId: number;
  initialAssignments: WeeklyAssignment[];
  initialOccurrences: SessionOccurrence[];
  eligibleRiders: Rider[];
}) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [occurrences, setOccurrences] = useState(initialOccurrences);
  const [error, setError] = useState<string | null>(null);
  const [riderId, setRiderId] = useState<number | "">("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("17:00");
  const [ftpByRider, setFtpByRider] = useState<Record<number, FtpZones>>({});

  async function refresh() {
    const response = await fetch(`/api/coaches/${coachId}/schedule`);
    if (!response.ok) return;
    const body = (await response.json()) as {
      assignments: WeeklyAssignment[];
      occurrences: SessionOccurrence[];
    };
    setAssignments(body.assignments);
    setOccurrences(body.occurrences);
  }

  async function addAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (riderId === "") {
      setError("Choose a rider.");
      return;
    }

    const response = await fetch(`/api/coaches/${coachId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        riderId,
        sessionType: SESSION_TYPES[0],
        dayOfWeek,
        startTime,
        durationMinutes: 60,
      }),
    });

    if (!response.ok) {
      setError(await readError(response));
      return;
    }

    setRiderId("");
    await refresh();
  }

  async function removeAssignment(assignmentId: number) {
    setError(null);
    const response = await fetch(
      `/api/coaches/${coachId}/schedule/${assignmentId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    await refresh();
  }

  async function cancelOccurrence(occurrenceId: number) {
    setError(null);
    const response = await fetch(
      `/api/coaches/${coachId}/occurrences/${occurrenceId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      },
    );
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    await refresh();
  }

  async function rescheduleOccurrence(
    occurrenceId: number,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/coaches/${coachId}/occurrences/${occurrenceId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          occurrenceDate: String(data.get("occurrenceDate")),
          startTime: String(data.get("startTime")),
        }),
      },
    );
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    await refresh();
  }

  async function loadFtp(rider: number) {
    const response = await fetch(
      `/api/coaches/${coachId}/riders/${rider}/ftp?sessionType=${SESSION_TYPES[0]}`,
    );
    if (!response.ok) return;
    const zones = (await response.json()) as FtpZones;
    setFtpByRider((prev) => ({ ...prev, [rider]: zones }));
  }

  async function saveFtp(rider: number, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);

    const response = await fetch(`/api/coaches/${coachId}/riders/${rider}/ftp`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionType: SESSION_TYPES[0],
        z1Watts: Number(data.get("z1")),
        z2Watts: Number(data.get("z2")),
        z3Watts: Number(data.get("z3")),
        z4Watts: Number(data.get("z4")),
        z5Watts: Number(data.get("z5")),
      }),
    });

    if (!response.ok) {
      setError(await readError(response));
      return;
    }

    const saved = (await response.json()) as FtpZones;
    setFtpByRider((prev) => ({ ...prev, [rider]: saved }));
  }

  const scheduled = occurrences.filter((o) => o.status === "scheduled");

  return (
    <div className="mt-10">
      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <section>
        <h2 className="text-xl font-semibold">Weekly assignments</h2>
        <ul className="mt-4 divide-y divide-[#e3e3e3]">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex-1">
                {assignment.riderDisplayName ?? `Rider #${assignment.riderId}`} —{" "}
                {DAYS_OF_WEEK[assignment.dayOfWeek]} {assignment.startTime}
              </span>
              <button
                type="button"
                onClick={() => loadFtp(assignment.riderId)}
                className="text-sm font-semibold text-[#5025d1] underline"
              >
                FTP zones
              </button>
              <button
                type="button"
                onClick={() => removeAssignment(assignment.id)}
                className="text-sm font-semibold text-red-700 underline"
              >
                Remove
              </button>
              {ftpByRider[assignment.riderId] && (
                <form
                  onSubmit={(event) => saveFtp(assignment.riderId, event)}
                  className="flex w-full flex-wrap gap-2"
                >
                  {(["z1", "z2", "z3", "z4", "z5"] as const).map((zone, index) => (
                    <input
                      key={zone}
                      name={zone}
                      type="number"
                      min={1}
                      max={3000}
                      defaultValue={
                        ftpByRider[assignment.riderId][
                          `z${index + 1}Watts` as keyof FtpZones
                        ] ?? ""
                      }
                      placeholder={`Z${index + 1} watts`}
                      className="w-28 rounded border border-[#c9c9c9] px-2 py-1 text-sm"
                    />
                  ))}
                  <button
                    type="submit"
                    className="min-h-9 rounded-[50px] bg-[#1a1a1a] px-4 text-xs font-semibold text-white"
                  >
                    Save zones
                  </button>
                </form>
              )}
            </li>
          ))}
          {assignments.length === 0 && (
            <li className="py-3 text-[#56585e]">No riders scheduled yet.</li>
          )}
        </ul>

        <form onSubmit={addAssignment} className="mt-6 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Rider
            <select
              value={riderId}
              onChange={(event) =>
                setRiderId(event.target.value ? Number(event.target.value) : "")
              }
              className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
            >
              <option value="">Choose a rider</option>
              {eligibleRiders.map((rider) => (
                <option key={rider.id} value={rider.id}>
                  {rider.displayName ?? `Rider #${rider.id}`}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Day
            <select
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(Number(event.target.value))}
              className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
            >
              {DAYS_OF_WEEK.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Time
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="mt-1 block min-h-11 rounded border border-[#c9c9c9] px-3"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white"
          >
            Add to calendar
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Upcoming sessions</h2>
        <ul className="mt-4 divide-y divide-[#e3e3e3]">
          {scheduled.map((occurrence) => (
            <li key={occurrence.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex-1">
                {occurrence.occurrenceDate} {occurrence.startTime} —{" "}
                {occurrence.riderDisplayName ?? `Rider #${occurrence.riderId}`}
                {occurrence.riderPlaylistUrl && (
                  <>
                    {" "}
                    —{" "}
                    <a
                      href={occurrence.riderPlaylistUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#5025d1] underline"
                    >
                      playlist
                    </a>
                  </>
                )}
              </span>
              <form
                onSubmit={(event) => rescheduleOccurrence(occurrence.id, event)}
                className="flex items-center gap-2"
              >
                <input
                  type="date"
                  name="occurrenceDate"
                  defaultValue={occurrence.occurrenceDate}
                  className="rounded border border-[#c9c9c9] px-2 py-1 text-sm"
                />
                <input
                  type="time"
                  name="startTime"
                  defaultValue={occurrence.startTime}
                  className="rounded border border-[#c9c9c9] px-2 py-1 text-sm"
                />
                <button
                  type="submit"
                  className="text-sm font-semibold text-[#5025d1] underline"
                >
                  Reschedule
                </button>
              </form>
              <button
                type="button"
                onClick={() => cancelOccurrence(occurrence.id)}
                className="text-sm font-semibold text-red-700 underline"
              >
                Cancel this date
              </button>
            </li>
          ))}
          {scheduled.length === 0 && (
            <li className="py-3 text-[#56585e]">No upcoming sessions.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coach-schedule-ui.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/coach/CoachScheduleManager.tsx tests/coach-schedule-ui.test.ts
git commit -m "feat: add coach schedule manager UI component"
```

---

### Task 10: Coach and admin pages

**Files:**
- Create: `app/coach/page.tsx`
- Create: `app/admin/coaches/page.tsx`
- Create: `app/admin/coaches/[id]/page.tsx`

**Interfaces:**
- Consumes: `CoachScheduleManager` (Task 9); `listWeeklyAssignmentsForCoach`, `listSchedulableRiders` (Task 3); `ensureOccurrencesGenerated`, `listOccurrencesForCoach` (Task 4); `getCurrentUser` (`lib/current-user.ts`, existing); `getDb` (`lib/db.ts`); `requireAdminUser`, `listUsersWithPersonas` (`lib/persona-admin.ts`, existing).
- Produces: `/coach` and `/admin/coaches[...]` routes. No automated test: matches the existing convention that async server pages (`app/admin/personas/page.tsx`) and client pages with `useEffect` data fetching (`app/admin/profiles/manage/edit/[slug]/page.tsx`) are verified manually, not unit tested.

- [ ] **Step 1: Write the pages**

```tsx
// app/coach/page.tsx
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import {
  ensureOccurrencesGenerated,
  listOccurrencesForCoach,
} from "@/lib/session-occurrences";
import {
  listSchedulableRiders,
  listWeeklyAssignmentsForCoach,
} from "@/lib/weekly-assignments";
import CoachScheduleManager from "./CoachScheduleManager";

export const metadata: Metadata = {
  title: "Your calendar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const user = await getCurrentUser();

  if (!user || !user.personas.includes("coach")) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <h1 className="text-3xl font-semibold">Not available</h1>
        <p className="mt-4 text-[#56585e]">
          You do not have access to this page.
        </p>
      </div>
    );
  }

  const db = await getDb();
  const [assignments, eligibleRiders] = await Promise.all([
    listWeeklyAssignmentsForCoach(db, user.id, user.id),
    listSchedulableRiders(db),
  ]);
  await ensureOccurrencesGenerated(db);
  const occurrences = await listOccurrencesForCoach(db, user.id, user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
      <h1 className="text-3xl font-semibold md:text-4xl">Your calendar</h1>
      <p className="mt-4 max-w-2xl text-[#56585e]">
        Manage weekly Intervals assignments, upcoming sessions, and each
        rider&apos;s FTP zones.
      </p>
      <CoachScheduleManager
        coachId={user.id}
        initialAssignments={assignments}
        initialOccurrences={occurrences}
        eligibleRiders={eligibleRiders}
      />
    </div>
  );
}
```

```tsx
// app/admin/coaches/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { listUsersWithPersonas, requireAdminUser } from "@/lib/persona-admin";

export const metadata: Metadata = {
  title: "Manage coach calendars",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCoachesPage() {
  const db = await getDb();

  let coaches;
  try {
    const { headers } = await import("next/headers");
    const requestHeaders = await headers();
    await requireAdminUser(
      db,
      new Request("https://radtrails.org/admin/coaches", {
        headers: requestHeaders,
      }),
    );
    const users = await listUsersWithPersonas(db);
    coaches = users.filter((user) => user.personas.includes("coach"));
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <h1 className="text-3xl font-semibold">Not available</h1>
        <p className="mt-4 text-[#56585e]">
          You do not have access to this page.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <h1 className="text-3xl font-semibold md:text-4xl">Coach calendars</h1>
      <ul className="mt-8 divide-y divide-[#e3e3e3]">
        {coaches.map((coach) => (
          <li key={coach.id} className="py-3">
            <Link
              href={`/admin/coaches/${coach.id}`}
              className="text-sm font-semibold text-[#5025d1] underline"
            >
              {coach.displayName ?? coach.email ?? `Coach #${coach.id}`}
            </Link>
          </li>
        ))}
        {coaches.length === 0 && (
          <li className="py-3 text-[#56585e]">No coaches yet.</li>
        )}
      </ul>
    </div>
  );
}
```

```tsx
// app/admin/coaches/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import CoachScheduleManager from "@/app/coach/CoachScheduleManager";
import type { SessionOccurrence } from "@/lib/session-occurrences";
import type { WeeklyAssignment } from "@/lib/weekly-assignments";

type Rider = { id: number; displayName: string | null };

type ScheduleResponse = {
  assignments: WeeklyAssignment[];
  occurrences: SessionOccurrence[];
  eligibleRiders: Rider[];
};

export default function AdminCoachSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const response = await fetch(`/api/coaches/${id}/schedule`);
      if (cancelled) return;

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setLoadError(body.error ?? "You do not have access to this page.");
        return;
      }

      setData((await response.json()) as ScheduleResponse);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <h1 className="text-3xl font-semibold">Not available</h1>
        <p className="mt-4 text-[#56585e]">{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 md:px-8">
        <p className="text-[#56585e]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
      <h1 className="text-3xl font-semibold md:text-4xl">Coach calendar</h1>
      <CoachScheduleManager
        coachId={Number(id)}
        initialAssignments={data.assignments}
        initialOccurrences={data.occurrences}
        eligibleRiders={data.eligibleRiders}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify manually against the dev server**

With `npm run dev` running: sign in as a user holding the `coach` persona and visit `http://localhost:3000/coach` — expect the schedule manager, not the "Not available" message. Sign in as a `member`-only user and visit the same URL — expect "Not available". Sign in as an `admin` and visit `http://localhost:3000/admin/coaches` — expect the coach list; click through to `/admin/coaches/<id>` and confirm the same manager loads with that coach's data.

- [ ] **Step 3: Commit**

```bash
git add app/coach/page.tsx app/admin/coaches
git commit -m "feat: add coach and admin calendar pages"
```

---

### Task 11: Profile page additions (playlist + my sessions)

**Files:**
- Create: `app/profile/PlaylistEditor.tsx`
- Create: `app/profile/MySessions.tsx`
- Modify: `app/profile/page.tsx`
- Test: `tests/profile-playlist-ui.test.ts`

**Interfaces:**
- Consumes: `getPlaylist` (Task 6), `listOccurrencesForRider` (Task 4), `type SessionOccurrence` (Task 4).
- Produces: `PlaylistEditor({ initialPlaylistUrl })`, `MySessions({ sessions })`, both rendered from `app/profile/page.tsx` after the existing `ProfileEditor`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/profile-playlist-ui.test.ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import MySessions from "@/app/profile/MySessions";
import PlaylistEditor from "@/app/profile/PlaylistEditor";
import type { SessionOccurrence } from "@/lib/session-occurrences";

test("the playlist editor shows the saved link", () => {
  const html = renderToStaticMarkup(
    createElement(PlaylistEditor, {
      initialPlaylistUrl: "https://open.spotify.com/playlist/abc",
    }),
  );

  expect(html).toContain("Session playlist");
  expect(html).toContain('value="https://open.spotify.com/playlist/abc"');
  expect(html).toContain("Save playlist");
});

test("my sessions lists only scheduled occurrences and renders nothing when there are none", () => {
  const scheduled: SessionOccurrence = {
    id: 1,
    weeklyAssignmentId: 1,
    coachId: 10,
    riderId: 20,
    riderDisplayName: null,
    riderPlaylistUrl: null,
    sessionType: "intervals",
    occurrenceDate: "2026-08-25",
    startTime: "17:00",
    durationMinutes: 60,
    status: "scheduled",
    notes: null,
  };
  const cancelled: SessionOccurrence = { ...scheduled, id: 2, status: "cancelled" };

  const withSessions = renderToStaticMarkup(
    createElement(MySessions, { sessions: [scheduled, cancelled] }),
  );
  expect(withSessions).toContain("2026-08-25");

  const empty = renderToStaticMarkup(
    createElement(MySessions, { sessions: [cancelled] }),
  );
  expect(empty).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/profile-playlist-ui.test.ts`
Expected: FAIL — `app/profile/PlaylistEditor` and `app/profile/MySessions` not found.

- [ ] **Step 3: Write the implementation**

```tsx
// app/profile/PlaylistEditor.tsx
"use client";

import { useState, type FormEvent } from "react";

type Feedback = { kind: "error" | "success"; message: string } | null;

export default function PlaylistEditor({
  initialPlaylistUrl,
}: {
  initialPlaylistUrl: string | null;
}) {
  const [playlistUrl, setPlaylistUrl] = useState(initialPlaylistUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/me/playlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrl: playlistUrl.trim() || null }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "That link could not be saved.");
      }

      const body = (await response.json()) as { playlistUrl: string | null };
      setPlaylistUrl(body.playlistUrl ?? "");
      setFeedback({ kind: "success", message: "Playlist saved." });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "That link could not be saved.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-10 border-t border-[#e3e3e3] pt-8">
      <h2 className="text-xl font-semibold">Session playlist</h2>
      <p className="mt-1 text-sm text-[#56585e]">
        Leave a link for your coach to play during your Intervals session.
        This is separate from your public profile and takes effect
        immediately.
      </p>
      {feedback && (
        <p
          className={`mt-4 rounded border px-4 py-3 text-sm ${
            feedback.kind === "error"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {feedback.message}
        </p>
      )}
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="url"
          name="playlistUrl"
          value={playlistUrl}
          onChange={(event) => setPlaylistUrl(event.target.value)}
          placeholder="https://open.spotify.com/playlist/..."
          maxLength={300}
          className="min-h-11 flex-1 rounded-lg border border-[#c9c9c9] px-3 py-2"
        />
        <button
          type="submit"
          disabled={isSaving}
          className="min-h-11 rounded-[50px] bg-[#1a1a1a] px-6 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save playlist"}
        </button>
      </form>
    </section>
  );
}
```

```tsx
// app/profile/MySessions.tsx
import type { SessionOccurrence } from "@/lib/session-occurrences";

export default function MySessions({
  sessions,
}: {
  sessions: SessionOccurrence[];
}) {
  const upcoming = sessions.filter((session) => session.status === "scheduled");

  if (upcoming.length === 0) return null;

  return (
    <section className="mt-10 border-t border-[#e3e3e3] pt-8">
      <h2 className="text-xl font-semibold">Your upcoming sessions</h2>
      <ul className="mt-4 divide-y divide-[#e3e3e3]">
        {upcoming.map((session) => (
          <li key={session.id} className="py-3">
            {session.occurrenceDate} at {session.startTime}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Modify `app/profile/page.tsx`:

```typescript
// Add to the import block:
import { getPlaylist } from "@/lib/athlete-playlist";
import { listOccurrencesForRider } from "@/lib/session-occurrences";
import MySessions from "./MySessions";
import PlaylistEditor from "./PlaylistEditor";
```

```typescript
// Add alongside the existing `const profile = await getOwnProfile(db, user.id);` line:
const playlist = await getPlaylist(db, user.id);
const sessions = await listOccurrencesForRider(db, user.id);
```

```tsx
// Immediately after the closing tag of <ProfileEditor ... /> (before the `{isAdmin && (...)}` block):
<MySessions sessions={sessions} />
<PlaylistEditor initialPlaylistUrl={playlist.playlistUrl} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/profile-playlist-ui.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Verify the profile page manually**

With `npm run dev` running, sign in, visit `http://localhost:3000/profile`, confirm "Your upcoming sessions" appears only when you have a scheduled occurrence (from Task 7/8's manual checks) and "Session playlist" always appears; save a playlist link and reload to confirm it persists.

- [ ] **Step 6: Commit**

```bash
git add app/profile/PlaylistEditor.tsx app/profile/MySessions.tsx app/profile/page.tsx tests/profile-playlist-ui.test.ts
git commit -m "feat: add playlist editor and upcoming sessions to the profile page"
```

---

### Task 12: Full regression pass

**Files:** none created; verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: every test file passes, including all new files from Tasks 2-9 and 11.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors. Fix any that appear in the new files before continuing.

- [ ] **Step 3: Confirm the Cloudflare build still produces OpenNext artifacts**

Run: `npm run build`
Expected: completes and produces `.open-next/worker.js` (per `AGENTS.md`, plain `next build` would not).

- [ ] **Step 4: Close the tracking issue**

Run: `bd close radtrails-0y1 --reason="Coach scheduling calendar implemented per docs/superpowers/specs/2026-08-18-coach-scheduling-design.md"`

- [ ] **Step 5: Report status**

Per this repo's conservative git profile, do not push. Report the final `git log` of new commits and `git status` to the user, and note that `npm run db:migrate:remote` still needs to run (with authorization) before this is usable in production.
