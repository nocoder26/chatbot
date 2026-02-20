import { test, expect } from '@playwright/test';

test.describe('Language Selection', () => {
  test('should persist language choice to localStorage', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Español').click();

    // After selecting Español, the Continue button becomes "Continuar"
    await page.getByRole('button', { name: /Continue|Continuar/ }).click();
    const storedLang = await page.evaluate(() => localStorage.getItem('izana_language'));
    expect(storedLang).toBe('es');
  });

  test('should offer all 9 languages', async ({ page }) => {
    await page.goto('/');
    const languages = ['English', 'Español', '日本語', 'हिन्दी', 'தமிழ்', 'తెలుగు', 'മലയാളം', 'Français', 'Português'];
    for (const lang of languages) {
      await expect(page.getByText(lang)).toBeVisible();
    }
  });
});
