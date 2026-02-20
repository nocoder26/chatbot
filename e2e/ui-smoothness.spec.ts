import { test, expect } from '@playwright/test';

test.describe('UI Smoothness', () => {
  test('should render landing page without layout shifts', async ({ page }) => {
    await page.goto('/');

    // Verify the page loads properly
    await expect(page.getByText('Select your language')).toBeVisible();

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 10); // small margin for scrollbar
  });

  test('should be responsive at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.getByText('Select your language')).toBeVisible();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375 + 10);
  });

  test('should be responsive at tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.getByText('Select your language')).toBeVisible();
  });

  test('should be responsive at desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByText('Select your language')).toBeVisible();
  });
});
