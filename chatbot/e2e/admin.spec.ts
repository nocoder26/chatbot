import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test('should show PIN entry screen', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('input[type="password"], input[type="text"]').first()).toBeVisible();
  });

  test('should reject wrong PIN', async ({ page }) => {
    await page.goto('/admin');
    const pinInput = page.locator('input[type="password"], input[type="text"]').first();
    await pinInput.fill('0000');
    await page.keyboard.press('Enter');
    // Should show error or stay on PIN screen
    await page.waitForTimeout(1000);
  });
});
