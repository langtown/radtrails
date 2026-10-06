import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu', exact: true }).tap();
});

test('mobile menu fills the viewport and closes with its button or Escape', async ({ page }) => {
  const close = page.getByRole('button', { name: 'Close menu', exact: true });
  const overlay = page.locator('div.fixed').filter({ has: close });
  await expect(overlay).toBeVisible();
  await expect.poll(() => overlay.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await close.tap();
  await expect(close).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.getByRole('button', { name: 'Open menu', exact: true }).tap();
  await page.keyboard.press('Escape');
  await expect(close).toHaveCount(0);
});

test('lower menu links scroll into view and navigate on small phones', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const close = page.getByRole('button', { name: 'Close menu', exact: true });
  const overlay = page.locator('div.fixed').filter({ has: close });
  const instagram = overlay.getByRole('link', { name: 'Instagram', exact: true });
  await instagram.scrollIntoViewIfNeeded();
  await expect(instagram).toBeInViewport();
  await expect(close).toBeInViewport();
  await overlay.getByRole('link', { name: 'Keeping it Rad', exact: true }).tap();
  await expect(page).toHaveURL(/\/keeping-it-rad$/);
  await expect(close).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('switching to desktop dismisses the menu and unlocks scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeHidden();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Keeping it Rad', exact: true })).toBeVisible();
});
