# Ride and Develop / Radtrails

This repo contains the Next.js rebuild of `radtrails.org`, migrated away from Hostinger Website Builder so the site can be managed through code, reviewed in Git, and deployed on Vercel.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Content Editing

Most editable site content lives in `lib/site-content.ts`:

- navigation and contact details
- donation and social links
- page metadata
- homepage gallery
- services and pricing
- coaches and racing team profiles

Images live in `public/images`. Reference them from content or pages with paths like `/images/gallery/trail.jpg`.

## Routes

- `/`
- `/services`
- `/racing`
- `/support`

## Verification

```bash
npm run build
BASE_URL=http://localhost:3000 ./test_pages.sh
```

`npm run build` may need network access because the app uses `next/font/google` for the Lato and Inter font files.

## Deployment

Deploy through Vercel using the standard Next.js project detection. Configure both `radtrails.org` and `www.radtrails.org` in Vercel before DNS cutover.

