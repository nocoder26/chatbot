import { test, expect } from '@playwright/test';

test.describe('Chat topic filter (reproductive health only)', () => {
  test.setTimeout(60000);

  test('off-topic message returns scope message and 3 suggested questions', async ({ page }) => {
    await page.goto('/');

    // Step 1: Language
    await page.getByText('English').click();
    await page.getByRole('button', { name: /Continue|Continuar/ }).click();

    // Step 2: Consent
    await expect(page.getByText('Privacy & Consent')).toBeVisible();
    await page.locator('input[type="checkbox"]').check();
    await page.getByText('I Agree — Continue').click();

    // Step 3: Registration — wait for usernames, pick first username and first avatar
    await expect(page.getByText('Create your anonymous profile')).toBeVisible();
    await page.waitForTimeout(2000);
    // Username buttons are title-case compound words (e.g. GratefulPanda)
    await page.getByRole('button', { name: /[A-Z][a-z]+[A-Z][a-z]+/ }).first().click();
    // Avatar: click first button that contains an img (avatar grid)
    await page.locator('button').filter({ has: page.locator('img') }).first().click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4: Security — skip
    await page.getByRole('button', { name: 'Skip for now (less secure)' }).click();

    // Step 5: Should land on chat
    await expect(page).toHaveURL(/\/chat/);
    await page.waitForTimeout(1000);

    // Step 6: Send off-topic message
    const input = page.getByPlaceholder(/Ask me anything|fertility/);
    await input.fill("What's the weather today?");
    await page.getByRole('button', { name: /Send|Submit/ }).or(page.locator('button[type="submit"]')).first().click();

    // Step 7: Wait for bot response with scope message
    await expect(page.getByText(/reproductive health companion|I can only answer|Izana is your/)).toBeVisible({ timeout: 20000 });

    // Step 8: Should show 3 suggested questions (e.g. What is IVF?, How can I improve my fertility?, What do my hormone levels mean?)
    await expect(page.getByText('What is IVF?')).toBeVisible({ timeout: 5000 });
    const continueExploring = page.getByText(/Continue Exploring/i);
    await expect(continueExploring).toBeVisible({ timeout: 3000 });
    const questionButtons = page.locator('button').filter({ hasText: '?' });
    await expect(questionButtons.first()).toBeVisible();
    expect(await questionButtons.count()).toBeGreaterThanOrEqual(3);
  });
});
