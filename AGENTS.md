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
- Cloudflare's deploy flow runs `npm run build` before `npx wrangler deploy`; `scripts/build.mjs` intentionally makes that default build produce OpenNext artifacts.

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

## Deployment Notes

Cloudflare deploy requires OpenNext artifacts:

- `.open-next/.build/open-next.config.mjs`
- `.open-next/worker.js`

Plain `next build` does not create these. That is why `npm run build` routes through `scripts/build.mjs` and OpenNext. Do not simplify it back to `next build` unless the Cloudflare deploy settings are changed at the same time.

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
