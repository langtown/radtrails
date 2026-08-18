# Ride and Develop / Radtrails

This repo contains the Next.js rebuild of `radtrails.org`, migrated away from Hostinger Website Builder so the site can be managed through code, reviewed in Git, and deployed on Cloudflare Workers with OpenNext.

## Local Development

```bash
nvm use
npm install
npm run db:migrate:local
npm run dev
```

Open `http://localhost:3000`.

Copy `.dev.vars.example` to the gitignored `.dev.vars`, then provide the Google OAuth credentials and
a random `ADMIN_BOOTSTRAP_TOKEN`. See [docs/authentication.md](docs/authentication.md) for OAuth,
first-admin setup, database migrations, security, free-tier limits, and the production checklist.

For D1 data copies and backups, use the Makefile targets documented in
[docs/authentication.md](docs/authentication.md). In particular, `make db-pull-prod` refreshes local
development data from production, while `make db-push-prod CONFIRM_PROD_SYNC=YES` is a destructive,
backup-first production replacement.

## Content Editing

Editable site content lives in `lib/content`, split by page:

- `site.ts`: navigation, contact details, donation, and social links
- `home.ts`: home page metadata and gallery
- `services.ts`: services, pricing, and coaches
- `racing.ts`: racing team profiles
- `support.ts`: support page metadata

Images live in `public/images`. Home page images live in `public/images/home`, and home gallery images live in `public/images/home/gallery`. Reference them from content or pages with paths like `/images/home/gallery/trail.jpg`.

### Common Updates

Update the organization name, email, phone, address, donation link, social links, or navigation in `lib/content/site.ts`.

Update home page gallery photos in `lib/content/home.ts`:

```ts
export const homeGallery = [
  { src: "/images/home/gallery/trail.jpg", alt: "Mountain biking trail" },
];
```

Add the image file to `public/images/home/gallery` and reference it with `/images/home/gallery/file-name.jpg`.

Update services, prices, and coach bios in `lib/content/services.ts`. Each service has a `title`, `intro`, and `items` list. Each coach has a `name`, `image`, `bio`, and `details`.

Update racing team profiles in `lib/content/racing.ts`. Each athlete entry looks like:

```ts
{
  name: "Rider Name",
  image: "/images/athletes/rider-name.jpg",
  imagePosition: "center 30%",
  bio: "Rider bio.",
}
```

`imagePosition` is optional. Use it when a rider's face needs a better crop in the team card. The first racer in the file is the featured racer; the rest are shown alphabetically on the page.

Add athlete photos to `public/images/athletes` and coach photos to `public/images/coaches`. Use lowercase, hyphenated file names where practical, for example `patti-felker-breiner.jpg`.

Update page titles and descriptions in the matching `*PageMeta` object in each content file.

## Routes

- `/`
- `/services`
- `/racing`
- `/support`
- `/profile` (signed-in profile editor)
- `/admin` (admin dashboard)
- `/admin/setup` (one-time first-admin setup)
- `/admin/personas` (admin only)
- `/admin/profiles` (admin only)

## Verification

```bash
nvm use
npm run lint
npm test
npm run build
npm run cf:build
BASE_URL=http://localhost:3000 ./test_pages.sh
```

`npm run build` and `npm run next:build` may need network access because the app uses `next/font/google` for the Lato and Inter font files.

## Deployment

Cloudflare must run the OpenNext build before Wrangler deploys the Worker. A plain `next build` only creates `.next`; Wrangler expects OpenNext artifacts such as `.open-next/.build/open-next.config.mjs` and `.open-next/worker.js`.

In Cloudflare Workers Builds, use:

```bash
npm run build
```

as the build command. The build wrapper detects Cloudflare's `WORKERS_CI=1` environment and runs
`npm run cf:preview:upload` after the outer OpenNext build completes. Local builds and OpenNext's
nested Next.js build do not upload anything.

Cloudflare's default production deploy command can remain:

```bash
npx wrangler deploy
```

Its default non-production branch deploy command can also remain:

```bash
npx wrangler versions upload
```

The build hook moves `preview-radtrails.langtown.workers.dev` to the completed build before
Cloudflare runs the appropriate production or non-production deployment step.

For local deployment, use:

```bash
nvm use
npm run deploy
```

Use `npm run next:build` only when you specifically want a plain Next.js build without Cloudflare/OpenNext artifacts.
