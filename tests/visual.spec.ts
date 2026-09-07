import { test, expect } from '@playwright/test';

const pages = [
  { url: '/', title: 'Home' },
  { url: '/services', title: 'Services' },
  { url: '/racing', title: 'Racing' },
  { url: '/community', title: 'Community' },
  { url: '/support', title: 'Support' },
];

for (const page of pages) {
  test(`${page.title} page renders without errors`, async ({ browser }) => {
    const context = await browser.newContext();
    const pageObj = await context.newPage();

    // Capture console errors
    const consoleErrors: string[] = [];
    pageObj.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to the page
    await pageObj.goto(page.url, { waitUntil: 'networkidle' });

    // Take a screenshot for visual verification
    await pageObj.screenshot({ path: `test-results/${page.title.toLowerCase()}-screenshot.png` });

    // Assert no console errors
    expect(consoleErrors).toHaveLength(0);

    // Verify page has content (basic smoke test)
    const headingCount = await pageObj.locator('h1, h2, h3').count();
    expect(headingCount).toBeGreaterThan(0);

    await context.close();
  });
}
