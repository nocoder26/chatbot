import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should show login form when "I already have an account" is clicked', async ({ page }) => {
    await page.goto('/');
    await page.getByText('I already have an account').click();
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByPlaceholder('Your username')).toBeVisible();
  });

  test('should allow going back to create new account', async ({ page }) => {
    await page.goto('/');
    await page.getByText('I already have an account').click();
    await page.getByText('Create a new account instead').click();
    await expect(page.getByText('Select your language')).toBeVisible();
  });
});
