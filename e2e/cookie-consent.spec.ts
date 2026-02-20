import { test, expect } from '@playwright/test';

test.describe('Cookie Consent Banner', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should show cookie consent banner on first visit', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    await expect(page.getByRole('heading', { name: 'Cookie & Privacy Notice' })).toBeVisible();
    await expect(page.getByText('Accept All')).toBeVisible();
    await expect(page.getByText('Essential Only')).toBeVisible();
  });

  test('should store "all" consent and device info when Accept All is clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Accept All' }).click();

    const consent = await page.evaluate(() => localStorage.getItem('izana_cookie_consent'));
    expect(consent).toBe('all');

    const deviceInfo = await page.evaluate(() => localStorage.getItem('izana_device_info'));
    expect(deviceInfo).not.toBeNull();
    const parsed = JSON.parse(deviceInfo!);
    expect(parsed).toHaveProperty('browser');
    expect(parsed).toHaveProperty('os');
    expect(parsed).toHaveProperty('screen');
    expect(parsed).toHaveProperty('timezone');
  });

  test('should store "essential" consent without device info when Essential Only is clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Essential Only' }).click();

    const consent = await page.evaluate(() => localStorage.getItem('izana_cookie_consent'));
    expect(consent).toBe('essential');

    const deviceInfo = await page.evaluate(() => localStorage.getItem('izana_device_info'));
    expect(deviceInfo).toBeNull();
  });

  test('should not show banner after consent is given', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('izana_cookie_consent', 'all');
    });
    await page.goto('/');
    await page.waitForTimeout(2000);
    await expect(page.getByRole('heading', { name: 'Cookie & Privacy Notice' })).not.toBeVisible();
  });
});
