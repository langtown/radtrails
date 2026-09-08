---
name: radtrails
description: Guidance for non-technical site owners managing Radtrails content, images, and pages — updating text, swapping images, adding team members/coaches, updating pricing, changing nav links, and verifying with Playwright. Use when asked to update site content, add or replace an image, add a racer or coach, update pricing, or change navigation on the Radtrails site.
---

# Radtrails Site Manager Skill

A comprehensive guide for helping non-technical site owners manage content, images, and pages on the Radtrails website.

---

## Quick Page Reference

| Page | URL | Content File(s) | JSX File |
|---|---|---|---|
| Home | `/` or `/home` | `lib/content/home.ts`, `lib/content/social.ts` | `app/home/page.tsx` |
| Services | `/services` | `lib/content/services.ts` | `app/services/page.tsx` |
| Racing | `/racing` | `lib/content/racing.ts` | `app/racing/page.tsx` |
| Community | `/community` | `lib/content/community.ts` | `app/community/page.tsx` |
| Support | `/support` | `lib/content/support.ts` | `app/support/page.tsx` |
| Sitewide (nav, footer, contact) | all pages | `lib/content/site.ts` | `app/layout.tsx`, `components/NavBar.tsx`, `components/Footer.tsx` |

---

## Common Tasks

### Update Text (Heading, Bio, Description)

1. Identify the page from the table above
2. Open the content file (`lib/content/[page].ts`) for that page
3. Find the text field and update it
4. Save the file
5. Run `npm run dev` to preview changes (dev server stays running)
6. Run `npx playwright test` to take screenshots and verify rendering
7. Check the screenshots in `test-results/`

**Example**: To change the home page heading, edit `lib/content/home.ts`.

### Add or Swap an Image

1. Prepare your image:
   - Recommended sizes (see table below)
   - Use JPEG or PNG format
   - If too large, resize: `npx sharp input.jpg -resize 1200 output.jpg`

2. Copy the image to the correct `public/images/` folder:
   - Athlete photos → `public/images/athletes/`
   - Coach photos → `public/images/coaches/`
   - Home gallery → `public/images/home/gallery/`
   - Home hero → `public/images/home/`
   - Support page → `public/images/support/`

3. Update the relevant content file with the new image path:
   - Use paths like `/images/athletes/filename.jpg`
   - Do **not** include `public/` in the path

4. Take a screenshot to verify:
   ```bash
   npx playwright test
   ```

### Add a Gallery Image (Home Page)

1. Save your image as `public/images/home/gallery/[name].jpg` (recommend 1200×900px)
2. Open `lib/content/home.ts`
3. Find the `homeGallery` array
4. Add a new entry:
   ```typescript
   { src: "/images/home/gallery/your-image.jpg", alt: "descriptive text" }
   ```
5. Save and test with `npx playwright test`

### Add a Team Member to the Racing Page

1. Save the athlete photo as `public/images/athletes/[name].jpg` (recommend 800×1000px portrait)
2. Open `lib/content/racing.ts`
3. Find the `racers` array (current team) or the `alumni` array (former team members)
4. Add a new entry:
   ```typescript
   {
     name: "Full Name",
     image: "/images/athletes/filename.jpg",
     bio: "Short biography or achievement",
     imagePosition: "center center"  // optional, adjust if face is cropped poorly
   }
   ```
5. **Note**: The first entry in `racers` is always featured. Remaining racers are sorted alphabetically. `alumni` has no featured entry.
6. If a rider's face is cropped poorly in the card, adjust `imagePosition` (e.g., `"center 30%"`) instead of re-cropping the image.

### Add a Coach (Services Page)

1. Save the coach photo as `public/images/coaches/[name].jpg` (recommend 800×1000px portrait)
2. Open `lib/content/services.ts`
3. Find the `coaches` array
4. Add at index 1 or 3 (the JSX renders `coaches[0]` as featured, then specific indices for additional coaches)
5. Entry format:
   ```typescript
   {
     name: "Full Name",
     image: "/images/coaches/filename.jpg",
     bio: "Expertise, background, specialties"
   }
   ```
6. Test with `npx playwright test`

### Update Service Pricing

1. Open `lib/content/services.ts`
2. Find `serviceGroups` array
3. Update the `items` array for the desired service group
4. Each item is a string like `"1 hour | $95"` or `"Package of 5 | $450"`
5. Save and test

### Update Contact Info / Phone / Email / Donation URL

1. Open `lib/content/site.ts`
2. Update these fields:
   - `siteEmail`
   - `sitePhone`
   - `donationUrl`
   - `socialLinks` (for social media)
3. Save and test

### Change Navigation Links

1. Open `lib/content/site.ts`
2. Find the `navItems` array
3. Update URLs and labels as needed:
   ```typescript
   { label: "Home", href: "/" }
   { label: "Services", href: "/services" }
   // A nav item can carry a dropdown via `children`:
   { label: "Racing", href: "/racing", children: [
     { label: "Team", href: "/racing" },
     { label: "Alumni", href: "/racing/alumni" },
   ] }
   ```
4. Test with `npx playwright test`

### Add a New Page Section (Advanced)

1. Edit the relevant page file (`app/[page]/page.tsx`)
2. Add a new `<section>` element following existing patterns:
   ```tsx
   <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
     {/* white background section */}
   </section>

   <section className="bg-[#f7f7f7] mx-auto max-w-7xl px-4 py-20 md:px-8">
     {/* gray background section */}
   </section>
   ```
3. Test with `npx playwright test`

---

## Image Sizing Reference

| Location | Recommended Dimensions | Notes |
|---|---|---|
| Hero images | 1920×1080px | Full-width background, uses `object-cover` |
| Home gallery grid | 1200×900px | Displayed in 3-column grid, responsive |
| Athlete cards | 800×1000px | Portrait orientation preferred |
| Coach photos | 800×1000px | Portrait orientation preferred |
| Logo | keep original | Typically 176×151px when displayed |
| Support page images | 1200×900px | General use, responsive |

**Resizing tip**: If an image is too large, use:
```bash
npx sharp input.jpg -resize 1200 output.jpg
```

---

## Testing and Verification

Always test before committing:

1. **Start the dev server** (if not already running):
   ```bash
   npm run dev
   ```
   Leave this terminal open — it stays running.

2. **Run visual tests** (in a separate terminal):
   ```bash
   npx playwright test
   ```
   This takes screenshots of all 5 pages and saves them to `test-results/`.

3. **View screenshots**:
   - Open the HTML report: `npx playwright show-report`
   - Or check the `test-results/` folder directly

4. **Quick spot check** (without Playwright):
   - Open your browser and navigate to `http://localhost:3000`
   - Check each page manually

---

## Committing and Creating a PR

Refer to `CONTRIBUTING.md` for the full workflow. Quick version:

1. Create a feature branch:
   ```bash
   git checkout -b feature/description
   ```

2. Make your changes (edit content files, add images, etc.)

3. Test with `npx playwright test`

4. Commit your changes:
   ```bash
   git commit -m "Description of change"
   ```

5. Push to origin:
   ```bash
   git push -u origin feature/description
   ```

6. GitHub will show a link to create a PR. Open it and fill in the description.

7. Your PR is ready for review!

**Note**: PRs must be created via the GitHub web interface — no GitHub CLI token is configured locally.

---

## Helpful Tips

- **Content files vs. JSX files**: Always edit `lib/content/*.ts` files first. Only edit page JSX if you need to change layout, visual treatment, or behavior.
- **Image position**: If a rider or coach's face looks cropped, add `imagePosition: "center 30%"` to their entry instead of re-cropping the image itself.
- **Donation URL**: The support page donation link is controlled by `donationUrl` in `lib/content/site.ts`.
- **Responsive design**: All layouts are responsive. Test on mobile by resizing your browser window.
- **Contact form**: The support page contact form is configured in `app/support/page.tsx`. Form submissions are handled server-side.

---

## Troubleshooting

**Dev server won't start**:
- Make sure you ran `nvm use` first
- Check that no other process is using port 3000
- Try: `npm run dev` again

**Images not showing**:
- Verify the file is in `public/images/`
- Check the path in content file (should NOT include `public/`)
- Restart the dev server

**Tests failing**:
- Ensure the dev server is running (`npm run dev`)
- Check for console errors in the browser
- Take a screenshot manually to verify rendering

**Git push rejected**:
- Pull latest from main: `git pull origin main`
- Rebase if needed: `git rebase origin/main`
- Push again: `git push -u origin feature/description`
