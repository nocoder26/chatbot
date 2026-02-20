import { test, expect } from '@playwright/test';

test.describe('Consent & GDPR Flow', () => {
  test('should show consent screen after language selection', async ({ page }) => {
    await page.goto('/');
    await page.getByText('English').click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Privacy & Consent')).toBeVisible();
    await expect(page.getByText('I consent to the processing and analysis of my anonymised data')).toBeVisible();
  });

  test('should have a single consent checkbox (not two)', async ({ page }) => {
    await page.goto('/');
    await page.getByText('English').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(1);
  });

  test('should require checkbox to proceed', async ({ page }) => {
    await page.goto('/');
    await page.getByText('English').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    const agreeButton = page.getByText('I Agree — Continue');
    await expect(agreeButton).toBeDisabled();

    await page.locator('input[type="checkbox"]').check();
    await expect(agreeButton).toBeEnabled();
  });

  test('should display privacy notice details', async ({ page }) => {
    await page.goto('/');
    await page.getByText('English').click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('pseudonymised')).toBeVisible();
    await expect(page.getByText('automatically deleted after 24 hours')).toBeVisible();
    await expect(page.getByText('never shared with third parties')).toBeVisible();
  });

  test('should allow going back from consent to language', async ({ page }) => {
    await page.goto('/');
    await page.getByText('English').click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Privacy & Consent')).toBeVisible();
    await page.getByText('Back').click();
    await expect(page.getByText('Select your language')).toBeVisible();
  });
});
