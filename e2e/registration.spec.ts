import { test, expect } from '@playwright/test';

test.describe('Registration Flow', () => {
  test('should show language selection on landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Select your language')).toBeVisible();
    await expect(page.getByText('English')).toBeVisible();
    await expect(page.getByText('Español')).toBeVisible();
  });

  test('should navigate through complete registration flow', async ({ page }) => {
    await page.goto('/');

    // Step 1: Select language
    await page.getByText('English').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: Consent screen (single checkbox)
    await expect(page.getByText('Privacy & Consent')).toBeVisible();
    await page.locator('input[type="checkbox"]').check();
    await page.getByText('I Agree — Continue').click();

    // Step 3: Registration (username + avatar)
    await expect(page.getByText('Create your anonymous profile')).toBeVisible();
  });

  test('should show privacy badges', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('End-to-end anonymous')).toBeVisible();
    await expect(page.getByText('No email required')).toBeVisible();
    await expect(page.getByText('Auto-deleted in 24h')).toBeVisible();
  });

  test('should have "I already have an account" option', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('I already have an account')).toBeVisible();
  });
});
