import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`cart and Clinics image at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.route('**/api/clinic/catalog', route => route.fulfill({ json: { products: [
      { id: 'price_test', name: 'Cornering clinic', description: 'Practice your skills', image: null, amount: 5000, currency: 'usd' },
    ] } }));
    await page.goto('/clinics');
    const cart = page.getByRole('link', { name: /^Shopping cart,/ });
    await expect(page.getByRole('button', { name: 'Add to bag +' })).toBeVisible();
    await expect(cart).toHaveCount(0);
    const bagBounds = await page.locator('aside[aria-labelledby="clinic-bag"]').boundingBox();
    const navBounds = await page.getByRole('banner').boundingBox();
    expect(bagBounds!.y - (navBounds!.y + navBounds!.height)).toBeLessThanOrEqual(30);
    if (width > 1024) expect(bagBounds!.x).toBeGreaterThan(width / 2);
    const photo = page.getByAltText('Rider practicing cornering around a cone with Ride and Develop');
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    if (width > 1024) {
      await page.locator('#clinic-collection').scrollIntoViewIfNeeded();
      await expect(page.locator('aside[aria-labelledby="clinic-bag"]')).toBeInViewport();
    }
    await page.getByRole('button', { name: 'Add to bag +' }).click();
    await expect(cart).toHaveAccessibleName('Shopping cart, 1 item');
    await page.getByRole('spinbutton').fill('3');
    await expect(cart).toHaveAccessibleName('Shopping cart, 3 items');
    await cart.click();
    await expect(page).toHaveURL(/\/clinics#clinic-bag$/);
    await expect(page.getByRole('heading', { name: 'Your bag' })).toBeInViewport();
    await page.goto('/services');
    await expect(page.getByRole('link', { name: 'Explore clinics & rentals' })).toHaveCount(0);
    await expect(page.getByRole('banner').getByRole('link', { name: 'Clinics', exact: true })).toHaveCount(0);
    await expect(cart).toHaveAccessibleName('Shopping cart, 3 items');
    const bounds = await cart.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    const second = await context.newPage();
    await second.goto('/clinics');
    await second.getByRole('button', { name: 'Remove Cornering clinic' }).click();
    await expect(cart).toHaveCount(0);
    await second.close();
    await page.goto('/clinics');
    await expect(cart).toHaveCount(0);
    await page.screenshot({ path: `/tmp/radtrails-clinics-${width}.png`, fullPage: true });
  });
}
