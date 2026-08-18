# Radtrails Sign-In

How people sign in to radtrails.org with a Google account, what it runs on, and what it costs.

The short version: the site talks to Google directly using standard OpenID Connect, and keeps its own
sessions and data in Cloudflare D1. There is no auth vendor, no Cloudflare Access, and no payment
method on the account.

---

## Services used

| Service | What it does here | Free allowance | Card on file? |
|---|---|---|---|
| **Cloudflare Workers** | Runs the whole site — pages *and* `/api/*` — as one Worker | 100,000 requests/day, 10ms CPU per request | No |
| **Cloudflare D1** | Users, sessions, personas, profiles, and uploaded images | 5M rows read/day, 100k written/day, 500MB per database | No |
| **Google Identity (OIDC)** | Authenticates the person. Google verifies who they are; we never see a password | No fee for basic sign-in | No |

### Deliberately not used

| Not used | Why |
|---|---|
| **Cloudflare Access** | Its free plan caps at 50 users. Going direct to Google removes that ceiling entirely. |
| **Cloudflare R2** | Enabling R2 requires a payment method even inside its free allowance. Images go in D1 instead. |
| **Workers Paid ($5/mo)** | Not needed at this traffic. |
| **Auth0 / Clerk / NextAuth** | An OIDC login is a few hundred lines against a documented standard. A vendor adds a bill and an outage we don't control. |

On the free plan, exceeding a daily allowance makes requests fail until the allowance resets. It does
not silently start charging.

---

## Why anyone can sign in

This project only ever asks Google for three scopes:

```
openid email profile
```

Those are **non-sensitive** scopes, and Google treats apps that use only them as exempt from the
usual restrictions. Concretely, once the app is published:

- No Google verification review.
- No 100-user cap and no trusted-user list.
- No "Google hasn't verified this app" warning screen.
- Authorizations don't expire after 7 days.

That exemption is the entire reason a hobby project can let the public sign in for free. **It
disappears the moment a sensitive scope is added** — asking for Gmail, Drive, Calendar, or contacts
would pull the app into verification, with a review process and an annual security assessment for
restricted scopes. Don't add scopes casually.

---

## The login flow

This is a genuine sequence, so the numbering matters — each step depends on the one before it.

1. The visitor clicks **Sign in with Google**, which hits `GET /api/auth/login`.
2. The Worker generates three one-time values — `state`, `nonce`, and a PKCE verifier — stores them
   briefly, and redirects the browser to Google.
3. Google authenticates the person and redirects back to `GET /api/auth/callback` with a short-lived
   authorization code.
4. The Worker checks the returned `state` matches what it issued. If not, the request is dropped.
5. The Worker exchanges the code for tokens at Google's token endpoint, sending the client secret and
   the PKCE verifier. This is a server-to-server call; the browser never sees it.
6. The Worker validates the ID token completely: signature against Google's public keys, issuer,
   audience, expiry, and nonce.
7. The Worker reads the `sub` claim — Google's permanent identifier for that account — and finds or
   creates the matching row in `users`.
8. A new session is created and returned as an opaque cookie. The person is signed in.
9. Every later `/api/*` request resolves that cookie to a user before touching any data.

### Google's endpoints

Discovery document: `https://accounts.google.com/.well-known/openid-configuration`

| Purpose | URL |
|---|---|
| Authorization | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token exchange | `https://oauth2.googleapis.com/token` |
| Public signing keys (JWKS) | `https://www.googleapis.com/oauth2/v3/certs` |

### What must be true of the ID token

All four are checked server-side. Any failure means no session.

| Claim | Requirement |
|---|---|
| Signature | Verifies against Google's current JWKS |
| `iss` | `https://accounts.google.com` or `accounts.google.com` |
| `aud` | Exactly our client ID |
| `exp` | Still in the future |
| `nonce` | Matches the value we sent in step 2 |

---

## Identity: `sub`, never email

A user is keyed on Google's `sub` claim, stored as `users.google_sub`.

Email is stored for display and contact, but **is not the identity**. People change their Gmail
address, and Google can reassign a Workspace address to a different person. Keying on email means an
address change silently orphans someone's account, or worse, hands their account to whoever inherits
the address. `sub` never changes and is never reused.

---

## Sessions

The session cookie is opaque — a random token, not a JWT. Nothing about the user is encoded in it.

- 32 bytes from a cryptographically secure random generator, base64url encoded.
- Only the **SHA-256 hash** is stored in D1. The raw token exists solely in the browser cookie, so a
  leaked database dump cannot be replayed as a login.
- Cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`, explicit `Expires`, 30-day lifetime.
- Expiry is enforced in the SQL query itself, so a stale row can never resolve even if the cleanup
  sweep hasn't run.
- Rotated on login, deleted on logout.

`Path` is `/` rather than something narrower, because the site is server-rendered by the same Worker
and the navigation has to know whether you're signed in while rendering the page — not only when the
browser later calls an API.

---

## Who appears on the site: two independent gates

Signing in gets you an account and nothing else. Appearing on radtrails.org requires **both** gates
to pass, and they're deliberately separate.

**Gate 1 — persona.** Decides whether and where someone appears. Every new account is granted
`member`, which is not public. An admin grants `theteam`, `coach`, or `alumni`.

| Persona | Public | Meaning |
|---|---|---|
| `member` | no | Default on first login. Has an account, appears nowhere. |
| `theteam` | yes | Appears on the racing page. |
| `coach` | yes | Appears on the services page. |
| `alumni` | yes | Former team member, off the active racing page. |
| `admin` | no | Reviews profiles and grants personas. |

A user holds *several* personas at once — Bobby Langin is both a coach and a racer.

**Gate 2 — content review.** Decides whether the current name, photo, bio, and social links are
published. Every edit returns the profile to `pending` and needs admin approval, including for
someone already on the team. Their last approved content keeps showing in the meantime.

So: putting someone in TheTeam does not publish an unapproved edit, and approving an edit does not
put someone on the site who has no public persona.

### Social profile links

A member-only account can create a profile, but cannot add social links. Once an admin grants any
persona other than `member` (for example `theteam`, `coach`, `alumni`, or `admin`), the profile editor
offers HTTPS links for Instagram, TikTok, Twitter/X, YouTube, Facebook, Strava, and a personal
website. This keeps ordinary member accounts private while letting public-facing and staff personas
share the channels relevant to their role.

The API enforces this rule as well as the UI. Known services must use their real host, arbitrary
fields and non-HTTPS URLs are rejected, and social edits follow the same review workflow as the rest
of the profile. Pending changes do not replace the last approved links until an admin approves them.

---

## Data stored

All in one D1 database, `radtrails-app`.

| Table | Holds |
|---|---|
| `users` | `google_sub`, email, display name, picture URL |
| `sessions` | SHA-256 hash of the session token, user, expiry |
| `user_data` | Private per-user key/value storage |
| `personas` | The five persona definitions |
| `user_personas` | Which personas each user holds, and which admin granted them |
| `profiles` | Profile draft: slug, display name, bio, image key, social links, review status |
| `published_profiles` | Last approved public profile snapshot, including approved social links |
| `profile_images` | Uploaded image bytes, keyed by content hash |

We never receive or store a Google password. We never request a Google refresh token, because the app
does not act on anyone's behalf after login — it only needs to know who they are, once.

## Development and production data workflow

Cloudflare D1 has separate local and remote databases. Local Wrangler state is under
`.wrangler/state/v3/d1`; the deployed Worker uses the remote database identified by `database_id` in
`wrangler.jsonc`. Running a local dev server does not read production unless a command explicitly uses
`--remote`.

Use the repository `Makefile` as the canonical workflow:

```bash
nvm use
make db-migrate-local                 # apply checked-in migrations locally
make db-backup-prod                  # full, timestamped production backup
make db-pull-prod                    # snapshot prod, replace local D1, import prod rows
```

`db-pull-prod` is intended for working on a copy of production data in development. Stop the dev
server first. It exports the current local database, moves the local D1 persistence directory to an
ignored timestamped backup, applies the checked-in migrations to a fresh local database, and imports
production application rows. Restore the moved directory or re-run the command if you need to undo a
pull. The export includes `profile_images` BLOBs, so profile photos come across with profile records.

To copy local rows to production, first run the tests and review the generated backup, then use the
explicit production confirmation:

```bash
make db-backup-local
make db-push-prod CONFIRM_PROD_SYNC=YES
```

This always writes a complete production backup before changing anything. It replaces application
rows, including users, sessions, personas, profiles, published profiles, and image BLOBs; expect all
existing sessions to be invalidated and all local identities to become production identities. It does
not copy `d1_migrations`; apply schema changes separately with `make db-migrate-prod`. If the command
fails, stop and restore the saved SQL backup through a reviewed Wrangler import rather than retrying
blindly.

Useful read-only/export targets are `make db-export-local-data`, `make db-export-prod-data`,
`make db-backup-local`, and `make db-backup-prod`. All files are written below `.local/d1-backups/`,
which is gitignored because exports contain personal data and image bytes. Never commit or paste an
export into an issue or chat. The table list in the Makefile must be updated if a new application
table is added.

The current app stores uploaded profile images as D1 BLOBs. If images or other objects move to R2 (or
another object store), a D1 SQL export will not contain those objects; add a separate versioned object
backup/copy step before relying on either sync direction.

---

## Configuration

| Name | Kind | Value |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Plain var | From Google Cloud. Not secret; it appears in redirect URLs. |
| `GOOGLE_CLIENT_SECRET` | **Cloudflare secret** | Never in git, never in client JavaScript. |
| `ADMIN_BOOTSTRAP_TOKEN` | **Cloudflare secret** | One-time code for creating the first administrator. At least 32 random bytes. |
| Redirect URI | Derived from request origin | Must exactly match what's registered with Google. |

Registered redirect URIs:

```
https://radtrails.org/api/auth/callback      (production)
http://localhost:3000/api/auth/callback      (local development)
```

Google matches redirect URIs **exactly** — scheme, host, port, and path. A trailing slash is a
different URI. If the site is ever reached on a `*.workers.dev` address, that is a different origin
and needs its own registered URI or sign-in will fail there.

> The mapping from `radtrails.org` to the Worker is configured in the Cloudflare dashboard, not in
> `wrangler.jsonc`. If the production hostname ever changes, the redirect URI registered with Google
> must change with it.

---

## Security properties

| Threat | What stops it |
|---|---|
| Login CSRF | `state`, checked on callback |
| Authorization code interception | PKCE (`code_challenge` / `code_verifier`) |
| ID token replay | `nonce`, checked against the token |
| Forged ID token | Signature verified against Google's JWKS |
| Token from another app | `aud` must equal our client ID |
| Stolen database → account takeover | Only session *hashes* are stored |
| Cookie theft via JavaScript | `HttpOnly` |
| Cookie sent over plain HTTP | `Secure` |
| Cross-site request forgery | `SameSite=Lax`, plus explicit checks on state-changing routes |
| Cross-origin API access | Credentialed CORS permits only the request's exact site origin, never `*` |
| Login or write bursts | Per-IP Workers rate-limit bindings cover login, data/profile writes, reviews, persona changes, and image uploads |
| SQL injection | Parameterized statements throughout |
| Reading another user's data | Every query scoped by the authenticated internal `user_id` |
| Privilege escalation | Persona grants verified against the database, not the request |
| First-admin takeover | Signed-in account plus a strong secret setup code, rate limiting, timing-safe comparison, and one atomic first-admin insert |

---

## Implementation status

The application is built and covered by more than 200 offline tests running in workerd against real in-memory
D1 migrations. The OpenNext production build also completes and emits `.open-next/worker.js`.

**Built and tested locally**

- Full OAuth start and callback flow with state, nonce, PKCE, token exchange, and ID-token validation
- Opaque sessions, `/api/me`, logout, signed-in navigation, and per-user private data
- Admin dashboard, one-time first-admin bootstrap, persona administration, and automatic `member` assignment on first sign-in
- Profile editing, social links for non-member personas, validated D1 image upload, and review queue
- Last-approved public snapshots, persona-filtered public APIs, ETags, and explicit edge-cache invalidation
- Same-origin CSRF checks, exact-origin credentialed CORS, and Workers rate limits on login and writes

**Production owner checks still required**

- Rotate the OAuth client secret that was exposed during setup, then update `.dev.vars` and Cloudflare
- Store a strong `ADMIN_BOOTSTRAP_TOKEN` in `.dev.vars` and Cloudflare before creating the first admin
- Confirm Google Auth Platform reports the app as **In production**
- Apply all remote migrations and deploy the current OpenNext Worker
- Confirm the serving Worker version inherited `GOOGLE_CLIENT_SECRET`, then complete one real sign-in

---

## Setting up the Google integration

You do steps 1–5 in a browser. They take about ten minutes.

### 1. Create or pick a Google Cloud project

Go to [console.cloud.google.com](https://console.cloud.google.com/). Create a project — call it
something like `radtrails-auth`. A project is just a container; creating one is free and does not
require billing.

### 2. Configure the consent screen

Go to **Google Auth Platform → Branding**
([console.cloud.google.com/auth/branding](https://console.cloud.google.com/auth/branding)).

This is what people see when Google asks them to sign in, so it should look like the org:

- **App name**: `Ride and Develop` (this is the name in "Ride and Develop wants to access your Google Account")
- **User support email**: your address
- **App logo**: optional — the Radtrails logo if you want it on the consent screen
- **Application home page**: `https://radtrails.org`
- **Authorized domain**: `radtrails.org`
- **Developer contact email**: your address

### 3. Set the audience to External

Go to **Google Auth Platform → Audience**
([console.cloud.google.com/auth/audience](https://console.cloud.google.com/auth/audience)).

Choose **External**. Internal only works for Google Workspace organizations and would limit sign-in to
your own domain.

New projects start in **Testing**, which only allows users you list by hand. Click **Publish app** to
move to **In production**.

Because this app requests only `openid`, `email`, and `profile`, publishing does **not** trigger a
verification review — there's no scary warning screen and no user cap. If Google asks you to submit
for verification, something has added a sensitive scope; stop and check the scopes before continuing.

### 4. Confirm the scopes

Under **Data Access**, confirm exactly these three and nothing else:

```
openid
.../auth/userinfo.email
.../auth/userinfo.profile
```

### 5. Create the OAuth client

Go to **Google Auth Platform → Clients**
([console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients)) and click
**Create client**.

- **Application type**: `Web application`
- **Name**: `radtrails web`
- **Authorized JavaScript origins**: leave empty — the browser never calls Google's API directly
- **Authorized redirect URIs**: add both, exactly as written

```
https://radtrails.org/api/auth/callback
http://localhost:3000/api/auth/callback
```

Google shows a **client ID** and a **client secret** once. Copy both. The secret can be regenerated
later if lost, but not re-displayed.

### 6. Store the credentials

The client ID goes in configuration. The secret goes in Cloudflare's secret store and **never** into
git:

```bash
npx wrangler versions secret put GOOGLE_CLIENT_SECRET
# paste the secret when prompted
```

Note it is `versions secret put`, not `secret put`. This Worker uses versioned deployments, so plain
`wrangler secret put` fails with *"the latest version of your Worker isn't currently deployed"*. The
`versions` form stores the secret on a **new, undeployed version** built from the currently-deployed
code — it does not upload your working tree. The other route out of that error, deploying first, would
push whatever is on your branch to the live site; don't take it to fix a secret.

Consequence to check at deploy time: the secret now lives on a version that is not serving traffic.
Cloudflare preserves secrets from the previous version when a new one is created, so the next deploy
should inherit it — but confirm after deploying rather than assuming, because a missing client secret
surfaces as `invalid_client` at the token exchange, after the user has already been sent to Google.

The Cloudflare dashboard (**Workers &amp; Pages → radtrails → Settings → Variables and Secrets**) sets
secrets without the version guard if the CLI gives trouble.

For local development, put both in `.dev.vars`. That file is gitignored (it was added to
`.gitignore` specifically for this — the existing `.env*` rule did not cover it):

```
GOOGLE_CLIENT_ID=<your client id>
GOOGLE_CLIENT_SECRET=<your client secret>
ADMIN_BOOTSTRAP_TOKEN=<a random value of at least 32 bytes>
```

### 7. Become the first admin

Generate a one-time setup code locally. Keep the output private:

```bash
openssl rand -base64 32
```

Put the same value in local `.dev.vars` as `ADMIN_BOOTSTRAP_TOKEN`. For production, store it as a
Cloudflare secret using the versioned command required by this Worker:

```bash
npx wrangler versions secret put ADMIN_BOOTSTRAP_TOKEN
# paste the generated code when prompted
```

Then:

1. Sign in with the Google account that should own the site administration.
2. Open `/admin/setup`.
3. Enter the one-time setup code.
4. Continue to `/admin`, which links profile review and persona management.

The endpoint never accepts a target email or user id; it can promote only the authenticated account.
The grant is one atomic D1 statement and is permanently disabled as soon as any admin exists, so two
concurrent setup attempts cannot produce two initial admins. Later admins must be granted by an
existing admin from **Admin dashboard → Manage people**. The first grant has `granted_by = NULL`
because no earlier administrator made it.

---

## If sign-in breaks

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | The registered URI doesn't match byte for byte. Check scheme, port, trailing slash. |
| "Google hasn't verified this app" | Still in Testing, or a sensitive scope crept in. |
| `invalid_client` | Wrong client secret, or the secret wasn't set in Cloudflare. |
| Signed in, then immediately signed out | Cookie rejected — usually `Secure` over plain HTTP. |
| Works locally, fails in production | Production redirect URI missing, or the secret was only set locally. |

---

## Sources

- [OpenID Connect — Google Identity](https://developers.google.com/identity/openid-connect/openid-connect)
- [OAuth API verification FAQs](https://support.google.com/cloud/answer/13463073)
- [When verification is not needed](https://support.google.com/cloud/answer/13464323)
- [Manage app audience](https://support.google.com/cloud/answer/15549945)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
