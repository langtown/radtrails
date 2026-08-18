<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Radtrails Codebase Guide

`CLAUDE.md` imports this file, so keep project-level agent instructions here. This app is a Next.js App Router rebuild of `radtrails.org`, deployed to Cloudflare Workers through OpenNext.

## Runtime and Commands

- Use `nvm use` before Node/npm commands. The project expects the version in `.nvmrc`.
- Development: `npm run dev`.
- Lint: `npm run lint`.
- Cloudflare build: `npm run build` or `npm run cf:build`.
- Plain Next.js build only: `npm run next:build`.
- Local deploy: `npm run deploy`.
- Cloudflare Workers Builds runs `npm run build` before `npm run cf:deploy` on `main`, or before `npm run cf:preview:upload` on non-production branches. `scripts/build.mjs` intentionally makes that default build produce OpenNext artifacts.

## App Structure

- `app/layout.tsx`: global layout, metadata defaults, navigation, and footer.
- `app/page.tsx`: root route. It re-exports the home page so `/` and `/home` share the same implementation.
- `app/home/page.tsx`: home page.
- `app/services/page.tsx`: services, pricing, and coaching page.
- `app/racing/page.tsx`: racing team page.
- `app/support/page.tsx`: support/contact/donation page.
- `app/globals.css`: global Tailwind/CSS styling.
- `components/NavBar.tsx`: shared top navigation.
- `components/Footer.tsx`: shared footer.
- `lib/content/*.ts`: editable site content split by page.
- `public/images/**`: static image assets referenced by content and pages.
- `wrangler.jsonc`: Cloudflare Worker configuration. Main output is `.open-next/worker.js`.
- `open-next.config.ts`: OpenNext Cloudflare adapter config.
- `scripts/build.mjs`: build wrapper that prevents OpenNext recursion when Cloudflare invokes `npm run build`.

## Content Files

Editable content is intentionally centralized in `lib/content`:

- `site.ts`: site name, contact info, donation URL, social links, and navigation items.
- `home.ts`: home page SEO metadata and homepage gallery image list.
- `services.ts`: services, prices, coaching profiles, and services page SEO metadata.
- `racing.ts`: racing page SEO metadata, featured racer details, legacy copy, and athlete profiles.
- `support.ts`: support page SEO metadata.

Prefer updating these content files before editing page JSX. Use page JSX only when changing layout, visual treatment, or behavior.

## Images

- Site logo: `public/images/logo.png`.
- Home page images: `public/images/home`.
- Home gallery images: `public/images/home/gallery`.
- Athlete images: `public/images/athletes`.
- Coach images: `public/images/coaches`.
- Support page images: `public/images/support`.

Reference images with public paths such as `/images/athletes/mia-morris.jpg`; do not include `public` in the URL.

Racing athlete cards use `object-cover` plus an optional `imagePosition` field in `lib/content/racing.ts`. Add or adjust `imagePosition`, for example `"center 32%"`, when a rider's face is cropped poorly. If a source photo has baked-in white borders or phone UI, crop the asset itself rather than stretching it.

## Racing Page Notes

- The first entry in `racers` is the featured profile.
- Remaining racers are sorted alphabetically in `app/racing/page.tsx`.
- Josh Abugow currently uses `/images/logo.png` because no rider photo is available.
- If adding a racer, include `name`, `image`, `bio`, and optionally `imagePosition`.

## Tests

`npm test` runs Vitest through `@cloudflare/vitest-pool-workers`, so tests execute inside workerd
against a real in-memory D1 seeded from `migrations/`. Code under test runs on the same runtime as
production, and a migration that breaks a query fails the suite.

- `npm test` — single run. `npm run test:watch` — watch mode.
- Test files live in `tests/**/*.test.ts`.
- `tests/apply-migrations.ts` applies `migrations/` before any test file runs.
- The config is `vitest.config.mts`. It must stay `.mts`: the pool package is ESM-only and this
  project is not `"type": "module"`.

## Database (Cloudflare D1)

The app database is bound to the Worker as `DB` in `wrangler.jsonc`. Schema changes are checked-in
migrations under `migrations/`, applied through wrangler so local and remote stay in sync.

- Create the remote database once per account: `npm run db:create`, then paste the printed id into
  `database_id` in `wrangler.jsonc`. Until that is done the placeholder value makes remote commands
  fail; local development is unaffected.
- Apply migrations locally: `npm run db:migrate:local`. Do this before `npm run dev` or
  `npm run preview` — both read the same local state under `.wrangler/`.
- Apply migrations remotely: `npm run db:migrate:remote`.
- Ad-hoc local query: `npm run db:console:local -- "SELECT * FROM users"`.

Add new migrations as `migrations/NNNN_description.sql` with a monotonically increasing number. Never
edit an already-applied migration; add a new one instead.

## Authentication

Sign-in is direct Google OpenID Connect — no auth vendor, no Cloudflare Access. **`docs/authentication.md`
is the reference**: services and costs, the login flow, ID token validation rules, the session design,
the two-gate persona/review model, configuration, and the Google Cloud setup steps. Read it before
touching anything under `app/api/auth/`.

Two rules that are easy to get wrong and expensive to fix:

- Identity is `users.google_sub`, never email. Emails change and can be reassigned.
- Scopes stay `openid email profile`. Those are non-sensitive, which is what exempts the app from
  Google verification, the 100-user cap, and the unverified-app warning. Adding a sensitive scope
  (Gmail, Drive, Calendar, contacts) forfeits all three.

## API Route Structure

Route handlers must stay thin adapters. Business rules and authorization live in `lib/`, as plain
functions that take a `D1Database` as their first argument; the handler only translates between HTTP
and those functions.

This is not stylistic. Route handlers call `getCloudflareContext()`, which does not exist inside the
Vitest worker pool, so **anything written directly in a route handler cannot be unit tested**. Logic
in `lib/` runs against real D1 in tests. Put a rule in a handler and it ships unverified.

Authorization checks belong in the `lib/` function too, not only in the handler — see
`grantPersona()` and `applyPersonaChange()`, which verify the actor's `admin` persona against the
database so no caller can bypass the check by skipping HTTP.

Errors carrying an HTTP status (`PersonaChangeError`) let handlers map failures to responses without
re-deriving why something was refused.

Every `/api/*` route must run through `secureApiResponse()` and export `handleApiOptions` as
`OPTIONS`. The shared boundary in `lib/api-security.ts` rejects state-changing requests without an
exact matching `Origin` and never pairs credentialed CORS with a wildcard. Login, data/profile/admin
writes, and image uploads also use the corresponding rate-limit binding from `getAppRuntime()`.
Keep those checks ahead of authentication and D1 work so rejected bursts stay cheap.

## Personas

A user holds zero or more personas, which decide whether and where they appear on the public site.
Seeded in `migrations/0004_create_personas.sql`:

| Persona | Public | Meaning |
|---|---|---|
| `member` | no | Default, granted on first login. Has an account, appears nowhere. |
| `theteam` | yes | Appears on the racing page. |
| `coach` | yes | Appears on the services page. |
| `alumni` | yes | Former team member, off the active racing page. |
| `admin` | no | Reviews profiles, grants and revokes personas. |

Many-to-many on purpose: Bobby Langin is both a coach and the featured racer, so a single-value
column could not represent the real site. This replaces any `is_admin` flag — admin is a persona, so
authorization has one mechanism, not two.

**Persona is only the first of two gates.** It decides whether a user appears; `profiles.status`
decides whether their current name/image/bio/social links are approved for publication. Both must
pass.

Member-only accounts cannot add social links. Any account holding at least one persona other than
`member` may add Instagram, TikTok, Twitter/X, YouTube, Facebook, Strava, and website URLs. Keep the
platform list and limits centralized in `lib/profile-constraints.ts`; the API must continue to
enforce eligibility, HTTPS, supported hosts, and strict known fields even if the editor UI changes.
Social edits are moderated profile content and must not bypass the last-approved snapshot workflow.

Use `lib/personas.ts` rather than writing `user_personas` queries by hand. `grantPersona()` verifies
the grantor holds `admin` in the data layer, not just in the route, so no caller can hand out a
persona by bypassing HTTP. `grantDefaultPersona()` is the system path used at first login and can
only ever grant `member`.

### Granting the first admin

The first admin uses a separate one-time bootstrap path because `grantPersona()` correctly requires
an existing admin. Generate a strong code, store it in the gitignored `.dev.vars` locally and as the
Cloudflare secret `ADMIN_BOOTSTRAP_TOKEN` in production, then sign in with the intended Google account
and open `/admin/setup`.

```bash
openssl rand -base64 32
npx wrangler versions secret put ADMIN_BOOTSTRAP_TOKEN
```

The setup API accepts no user id or email: it grants the authenticated account and uses a single
atomic `INSERT ... WHERE NOT EXISTS` so simultaneous requests cannot bootstrap two admins. It is
rate-limited, same-origin only, and permanently refuses bootstrap once any admin exists. The first
grant records `granted_by` as NULL because no prior admin made it. Later admins are granted from
`/admin/personas` by an existing admin.

Verify the result with:

```bash
npx wrangler d1 execute DB --remote --command \
  "SELECT u.email, up.persona_key FROM users u JOIN user_personas up ON up.user_id = u.id"
```

Use the same commands without `--remote` against local development.

## Uploaded Images

Uploaded profile images are stored as BLOBs in the D1 `profile_images` table, not in R2. R2 would be
the natural home for blobs, but enabling it requires a payment method on the Cloudflare account even
within its free allowance, and this project is deliberately $0 with no card on file.

Consequences to respect when working on upload code:

- **D1 caps a single value at 2MB.** Reject uploads above roughly 1MB; do not assume large photos
  will be accepted the way an object store would accept them.
- `image_key` is a content hash, so image URLs are immutable and can be served with
  `Cache-Control: public, max-age=31536000, immutable`. That edge cache is what keeps D1 row reads
  negligible — do not serve images without it.
- Images live in their own table so queries against `profiles` never drag blob data along. Never
  `SELECT *` from `profile_images` in a listing query.
- Deleting a profile does not delete its image; keys are shared and orphans are swept separately.

If R2 is enabled on the account later, this is the seam to revisit: swap the `profile_images` table
for a bucket and keep `image_key` as the object key.

`lib/db.ts` exposes `getDb()`, which returns the `D1Database` from the OpenNext Cloudflare context.
Use it from route handlers rather than reaching for `getCloudflareContext()` directly, and always use
parameterized statements.

Binding types come from `worker-configuration.d.ts`, generated by `npm run cf:types`. Rerun that
after changing bindings in `wrangler.jsonc`. `cloudflare-env.d.ts` merges those generated types into
the `CloudflareEnv` interface OpenNext uses. `next.config.ts` calls `initOpenNextCloudflareForDev()`,
which is what makes bindings available to `next dev` — without it `getDb()` only works under
`npm run preview`.

## Deployment Notes

Cloudflare deploy requires OpenNext artifacts:

- `.open-next/.build/open-next.config.mjs`
- `.open-next/worker.js`

Plain `next build` does not create these. That is why `npm run build` routes through `scripts/build.mjs` and OpenNext. Do not simplify it back to `next build` unless the Cloudflare deploy settings are changed at the same time.

The production deploy script also uploads the completed build with the `preview` alias. Non-production
branches only upload the aliased version, so they do not replace the active production deployment.
Both flows update `preview-radtrails.langtown.workers.dev` to the most recently completed build.

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/description`
2. Make your changes
3. Commit with a clear message: `git commit -m "Description of change"`
4. Push to origin: `git push -u origin feature/description`
5. Create a PR on GitHub via the link shown after push, or at `github.com/langtown/radtrails/pull/new/feature/description`
6. Use force push only if amending the commit: `git push -f origin branch-name`

No GitHub CLI token is configured in this environment, so PRs must be created manually through the GitHub web interface.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->

## Site Manager Skill

For step-by-step guidance on content changes, image sizing, section additions, and Playwright testing, see `.claude/skills/radtrails.md`.
